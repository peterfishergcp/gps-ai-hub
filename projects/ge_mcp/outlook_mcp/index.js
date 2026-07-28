import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import https from "https";
import { createServer } from "http";
import dotenv from "dotenv";

dotenv.config();

// Configure HTTP Keep-Alive agent for fast Graph API connection pooling
const keepAliveAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 30000
});
axios.defaults.httpsAgent = keepAliveAgent;

// Helper to retrieve Microsoft Graph authorization headers using OAuth 2.0
async function getGraphHeaders(req) {
    const authHeader = req.headers.authorization;
    
    console.error(`[AUTH LOG] Raw authHeader: ${authHeader ? (authHeader.substring(0, 15) + '...') : 'None'}`);
    
    // 1. Check if a real delegated user Bearer token was provided by the client
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ') && !authHeader.includes('mock')) {
        console.error("[AUTH LOG] Detected Real User Token - Connecting with Delegated User Identity.");
        return {
            Authorization: authHeader,
            Accept: 'application/json'
        };
    }

    console.error("[AUTH LOG] Falling back to Application Client Credentials OAuth 2.0 flow.");
    const tenantId = process.env.MS_GRAPH_TENANT_ID;
    const clientId = process.env.MS_GRAPH_CLIENT_ID;
    const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        console.error("[AUTH LOG] Environment variables missing, returning mock authentication headers for local testing.");
        return {
            Authorization: 'Bearer mock_graph_token',
            Accept: 'application/json'
        };
    }

    try {
        // Obtain Access Token from Microsoft Entra ID (Azure AD)
        const tokenResponse = await axios.post(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                scope: 'https://graph.microsoft.com/.default',
                grant_type: 'client_credentials'
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        return {
            Authorization: `Bearer ${tokenResponse.data.access_token}`,
            Accept: 'application/json'
        };
    } catch (err) {
        console.error("[AUTH LOG] Failed to obtain OAuth token from Microsoft Entra ID:", err.message);
        throw new Error(`OAuth token retrieval failed: ${err.message}`);
    }
}

// Helper to target user endpoint (/me for delegated tokens, /users/{userPrincipalName} for app tokens)
function getUserGraphPrefix() {
    const userPrincipalName = process.env.MS_GRAPH_USER_PRINCIPAL_NAME;
    if (userPrincipalName) {
        return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userPrincipalName)}`;
    }
    return `https://graph.microsoft.com/v1.0/me`;
}

const server = createServer(async (req, res) => {
    const reqProxy = new Proxy(req, {
        get(target, prop, receiver) {
            if (prop === 'headers') {
                return {
                    ...target.headers,
                    'accept': 'application/json, text/event-stream'
                };
            }
            return Reflect.get(target, prop, receiver);
        }
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization, Accept");

    if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
    }

    const host = req.headers.host || 'localhost';
    const url = new URL(req.url, `http://${host}`);

    // --- Primary MCP Endpoint ---
    if (url.pathname === "/mcp") {
        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true
            });

            const currentIsoTime = new Date().toISOString();
            const currentDateStr = new Date().toISOString().split('T')[0];

            const mcpServer = new Server({
                name: "outlook-mcp-server",
                version: "1.1.0",
            }, {
                capabilities: { tools: {} },
                instructions: `
Microsoft Outlook MCP Connector Guidelines & Temporal Search Rules:

CURRENT SYSTEM TIME / DATE REFERENCE:
- Today's Date: ${currentDateStr}
- Current ISO Timestamp: ${currentIsoTime}

1. TEMPORAL & RELATIVE DATE GUIDELINES:
   - When asked for "today", use fromDate: "${currentDateStr}T00:00:00Z".
   - When asked for "latest", "most recent", or "newest", set sortOrder: "desc" (default).
   - When asked for "oldest" or "earliest", set sortOrder: "asc".
   - When asked for "last week" or "past 7 days", calculate the ISO date range based on Today's Date (${currentDateStr}).

2. THREADS & MULTI-EMAIL AGGREGATION:
   - To fetch an entire email conversation thread, use 'get_email_thread_lookup' with the email's conversationId or messageId.
   - To retrieve details for multiple emails at once, use 'get_batch_messages_detail_lookup' passing an array of messageIds.

3. MAIL & CALENDAR CITATION REQUIREMENT:
   - For every email or calendar event referenced in your answer, provide a citation link:
     [Subject - Sender (Date)](webLink)`
            });

            // --- MCP Tool Handlers ---
            mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
                return {
                    tools: [
                        {
                            name: "query_messages_lookup",
                            description: "Read-only background lookup to search or list Outlook emails in Inbox with temporal date filtering and sorting (most recent, oldest, today, date ranges).",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    query: { type: "string", description: "Optional search query or keyword filter" },
                                    fromDate: { type: "string", description: "Optional start ISO date/time filter (e.g. 2026-07-21T00:00:00Z)" },
                                    toDate: { type: "string", description: "Optional end ISO date/time filter (e.g. 2026-07-28T23:59:59Z)" },
                                    sortOrder: { type: "string", enum: ["desc", "asc"], description: "'desc' for most recent / latest (default), 'asc' for oldest / earliest" },
                                    top: { type: "number", description: "Maximum number of messages to retrieve (default 10, max 50)" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "get_message_detail_lookup",
                            description: "Read-only background lookup to retrieve full body content, recipients, and conversation ID for a specific email by ID",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    messageId: { type: "string", description: "The unique ID of the message" }
                                },
                                required: ["messageId"]
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "get_batch_messages_detail_lookup",
                            description: "Read-only background lookup to retrieve full content for MULTIPLE emails at once (useful for aggregating information across multiple emails)",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    messageIds: { 
                                        type: "array", 
                                        items: { type: "string" }, 
                                        description: "List of message IDs to retrieve details for" 
                                    }
                                },
                                required: ["messageIds"]
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "get_email_thread_lookup",
                            description: "Read-only background lookup to fetch all emails in a complete conversation thread using a message ID or conversation ID",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    messageId: { type: "string", description: "A message ID in the thread" },
                                    conversationId: { type: "string", description: "Or direct conversation ID" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_calendar_events_lookup",
                            description: "Read-only background lookup to list or search Outlook calendar events with date filtering",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    query: { type: "string", description: "Optional search query for event title or content" },
                                    startDateTime: { type: "string", description: "Optional ISO start filter (e.g. 2026-07-28T00:00:00Z)" },
                                    endDateTime: { type: "string", description: "Optional ISO end filter (e.g. 2026-08-04T23:59:59Z)" },
                                    top: { type: "number", description: "Maximum number of events to retrieve (default 10)" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_contacts_lookup",
                            description: "Read-only background lookup to list Outlook contacts",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    query: { type: "string", description: "Optional search name or email filter" },
                                    top: { type: "number", description: "Maximum number of contacts to retrieve (default 10)" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "send_mail_action_lookup",
                            description: "Safe action to send an email via Outlook",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    to: { type: "string", description: "Recipient email address" },
                                    subject: { type: "string", description: "Email subject" },
                                    body: { type: "string", description: "Email text or HTML content" }
                                },
                                required: ["to", "subject", "body"]
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "create_event_action_lookup",
                            description: "Safe action to create a new calendar event in Outlook",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    subject: { type: "string", description: "Event title/subject" },
                                    startDateTime: { type: "string", description: "Start ISO timestamp (e.g. 2026-08-01T09:00:00)" },
                                    endDateTime: { type: "string", description: "End ISO timestamp (e.g. 2026-08-01T10:00:00)" },
                                    body: { type: "string", description: "Optional event description" },
                                    location: { type: "string", description: "Optional event location or Teams meeting link" }
                                },
                                required: ["subject", "startDateTime", "endDateTime"]
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: false
                            }
                        }
                    ]
                };
            });

            mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
                let { name, arguments: args = {} } = request.params;
                console.error(`Received CallToolRequest for tool: ${name}`);
                
                try {
                    const headers = await getGraphHeaders(req);
                    const userPrefix = getUserGraphPrefix();
                    let resultObj = {};

                    if (name === "query_messages_lookup" || name === "search_messages") {
                        const query = args.query || args.Query || "";
                        const fromDate = args.fromDate || args.FromDate;
                        const toDate = args.toDate || args.ToDate;
                        const sortOrder = (args.sortOrder || "desc").toLowerCase();
                        const top = Math.min(args.top || 10, 50);

                        let queryParams = [`$top=${top}`, `$select=id,subject,sender,from,receivedDateTime,bodyPreview,conversationId,webLink,isRead`];

                        // Build OData $orderby for sorting by receivedDateTime
                        queryParams.push(`$orderby=receivedDateTime ${sortOrder}`);

                        // Build OData $filter for date ranges
                        let filterConditions = [];
                        if (fromDate) {
                            filterConditions.push(`receivedDateTime ge ${fromDate}`);
                        }
                        if (toDate) {
                            filterConditions.push(`receivedDateTime le ${toDate}`);
                        }
                        if (filterConditions.length > 0) {
                            queryParams.push(`$filter=${encodeURIComponent(filterConditions.join(' and '))}`);
                        }

                        if (query) {
                            queryParams.push(`$search="${encodeURIComponent(query)}"`);
                        }

                        const endpoint = `${userPrefix}/messages?${queryParams.join('&')}`;
                        console.error(`[OUTLOOK LOG] Querying messages from: ${endpoint}`);

                        const response = await axios.get(endpoint, { headers });
                        const messages = (response.data.value || []).map(msg => ({
                            id: msg.id,
                            subject: msg.subject,
                            from: msg.from?.emailAddress?.address || msg.sender?.emailAddress?.address,
                            receivedDateTime: msg.receivedDateTime,
                            conversationId: msg.conversationId,
                            bodyPreview: msg.bodyPreview,
                            isRead: msg.isRead,
                            webLink: msg.webLink
                        }));
                        resultObj = { messages };

                    } else if (name === "get_message_detail_lookup") {
                        const messageId = args.messageId || args.MessageId;
                        if (!messageId) throw new Error("messageId is required.");

                        const endpoint = `${userPrefix}/messages/${encodeURIComponent(messageId)}`;
                        const response = await axios.get(endpoint, { headers });
                        resultObj = {
                            id: response.data.id,
                            subject: response.data.subject,
                            from: response.data.from?.emailAddress?.address,
                            toRecipients: (response.data.toRecipients || []).map(r => r.emailAddress?.address),
                            receivedDateTime: response.data.receivedDateTime,
                            conversationId: response.data.conversationId,
                            bodyType: response.data.body?.contentType,
                            bodyContent: response.data.body?.content,
                            webLink: response.data.webLink
                        };

                    } else if (name === "get_batch_messages_detail_lookup") {
                        const messageIds = args.messageIds || [];
                        if (!Array.isArray(messageIds) || messageIds.length === 0) {
                            throw new Error("messageIds array is required.");
                        }

                        console.error(`[OUTLOOK LOG] Batch fetching ${messageIds.length} messages...`);
                        const detailPromises = messageIds.slice(0, 10).map(async (msgId) => {
                            try {
                                const res = await axios.get(`${userPrefix}/messages/${encodeURIComponent(msgId)}`, { headers });
                                return {
                                    id: res.data.id,
                                    subject: res.data.subject,
                                    from: res.data.from?.emailAddress?.address,
                                    receivedDateTime: res.data.receivedDateTime,
                                    conversationId: res.data.conversationId,
                                    bodyContent: res.data.body?.content,
                                    webLink: res.data.webLink
                                };
                            } catch (err) {
                                return { id: msgId, error: err.message };
                            }
                        });

                        const messagesDetails = await Promise.all(detailPromises);
                        resultObj = { messages: messagesDetails };

                    } else if (name === "get_email_thread_lookup") {
                        let targetConversationId = args.conversationId || args.ConversationId;
                        const messageId = args.messageId || args.MessageId;

                        // If messageId was passed instead of conversationId, look up the conversationId first
                        if (!targetConversationId && messageId) {
                            const msgRes = await axios.get(`${userPrefix}/messages/${encodeURIComponent(messageId)}?$select=conversationId`, { headers });
                            targetConversationId = msgRes.data.conversationId;
                        }

                        if (!targetConversationId) {
                            throw new Error("Either conversationId or messageId is required to fetch a thread.");
                        }

                        console.error(`[OUTLOOK LOG] Fetching email thread for conversationId: ${targetConversationId}`);
                        const endpoint = `${userPrefix}/messages?$filter=${encodeURIComponent(`conversationId eq '${targetConversationId}'`)}&$orderby=receivedDateTime asc&$select=id,subject,from,receivedDateTime,bodyPreview,body,webLink`;
                        const response = await axios.get(endpoint, { headers });

                        const threadMessages = (response.data.value || []).map(msg => ({
                            id: msg.id,
                            subject: msg.subject,
                            from: msg.from?.emailAddress?.address,
                            receivedDateTime: msg.receivedDateTime,
                            bodyPreview: msg.bodyPreview,
                            bodyContent: msg.body?.content,
                            webLink: msg.webLink
                        }));

                        resultObj = { conversationId: targetConversationId, threadLength: threadMessages.length, messages: threadMessages };

                    } else if (name === "query_calendar_events_lookup") {
                        const query = args.query || args.Query || "";
                        const startDateTime = args.startDateTime || args.StartDateTime;
                        const endDateTime = args.endDateTime || args.EndDateTime;
                        const top = args.top || 10;

                        let endpoint = `${userPrefix}/events?$top=${top}&$select=id,subject,start,end,location,organizer,webLink&$orderby=start/dateTime desc`;
                        if (query) {
                            endpoint += `&$search="${encodeURIComponent(query)}"`;
                        }

                        console.error(`[OUTLOOK LOG] Querying calendar events from: ${endpoint}`);
                        const response = await axios.get(endpoint, { headers });
                        const events = (response.data.value || []).map(evt => ({
                            id: evt.id,
                            subject: evt.subject,
                            start: evt.start?.dateTime,
                            end: evt.end?.dateTime,
                            timeZone: evt.start?.timeZone,
                            location: evt.location?.displayName,
                            organizer: evt.organizer?.emailAddress?.address,
                            webLink: evt.webLink
                        }));
                        resultObj = { events };

                    } else if (name === "query_contacts_lookup") {
                        const query = args.query || args.Query || "";
                        const top = args.top || 10;

                        let endpoint = `${userPrefix}/contacts?$top=${top}&$select=id,displayName,givenName,surname,emailAddresses,mobilePhone`;
                        if (query) {
                            endpoint += `&$search="${encodeURIComponent(query)}"`;
                        }

                        const response = await axios.get(endpoint, { headers });
                        const contacts = (response.data.value || []).map(c => ({
                            id: c.id,
                            displayName: c.displayName,
                            emails: (c.emailAddresses || []).map(e => e.address),
                            phone: c.mobilePhone
                        }));
                        resultObj = { contacts };

                    } else if (name === "send_mail_action_lookup") {
                        const to = args.to || args.To;
                        const subject = args.subject || args.Subject;
                        const body = args.body || args.Body;

                        if (!to || !subject || !body) throw new Error("to, subject, and body are required to send email.");

                        const payload = {
                            message: {
                                subject: subject,
                                body: {
                                    contentType: "Text",
                                    content: body
                                },
                                toRecipients: [
                                    {
                                        emailAddress: { address: to }
                                    }
                                ]
                            }
                        };

                        const endpoint = `${userPrefix}/sendMail`;
                        console.error(`[OUTLOOK LOG] Sending email to ${to}...`);
                        await axios.post(endpoint, payload, { headers });
                        resultObj = { status: "Success", message: `Successfully sent email to ${to}` };

                    } else if (name === "create_event_action_lookup") {
                        const subject = args.subject || args.Subject;
                        const startDateTime = args.startDateTime || args.StartDateTime;
                        const endDateTime = args.endDateTime || args.EndDateTime;
                        const body = args.body || args.Body || "";
                        const location = args.location || args.Location || "";

                        if (!subject || !startDateTime || !endDateTime) throw new Error("subject, startDateTime, and endDateTime are required.");

                        const payload = {
                            subject: subject,
                            body: {
                                contentType: "HTML",
                                content: body
                            },
                            start: {
                                dateTime: startDateTime,
                                timeZone: "UTC"
                            },
                            end: {
                                dateTime: endDateTime,
                                timeZone: "UTC"
                            },
                            location: {
                                displayName: location
                            }
                        };

                        const endpoint = `${userPrefix}/events`;
                        console.error(`[OUTLOOK LOG] Creating event "${subject}"...`);
                        const response = await axios.post(endpoint, payload, { headers });
                        resultObj = {
                            status: "Success",
                            message: `Successfully created event "${subject}"`,
                            id: response.data.id,
                            webLink: response.data.webLink
                        };

                    } else {
                        throw new Error(`Tool not found: ${name}`);
                    }

                    // Simple empty result check
                    const hasNoResults = (
                        (Array.isArray(resultObj.messages) && resultObj.messages.length === 0) ||
                        (Array.isArray(resultObj.events) && resultObj.events.length === 0) ||
                        (Array.isArray(resultObj.contacts) && resultObj.contacts.length === 0)
                    );

                    if (hasNoResults) {
                        resultObj.userPrompt = "we didn't receive any query results for your query, would you try again and be more specific with your query.";
                    }

                    return { content: [{ type: "text", text: JSON.stringify(resultObj, null, 2) }] };
                } catch (error) {
                    console.error(`Error in tool execution:`, error.message);
                    return { 
                        content: [{ type: "text", text: `Error: ${error.message}` }], 
                        isError: true 
                    };
                }
            });

            mcpServer.connect(transport).catch(() => {});

            await transport.handleRequest(reqProxy, res);
        } catch (error) {
            console.error("Transport error:", error);
            if (!res.headersSent) {
                res.statusCode = 500;
                res.end("Internal Server Error: " + error.message);
            }
        }
        return;
    }

    // --- Mock / Delegated OAuth 2.0 Endpoints for Gemini Enterprise Registration ---
    if (url.pathname === "/auth") {
        const redirect_uri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state");
        res.statusCode = 302;
        res.setHeader("Location", `${redirect_uri}?code=mock&state=${state}`);
        res.end();
        return;
    }

    if (url.pathname === "/token") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
            access_token: "mock",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "mock_refresh"
        }));
        return;
    }

    // --- Health Check ---
    if (url.pathname === "/") {
        res.end("Outlook MCP Server (Native Node with Dual-Layer OAuth 2.0 Support) is fully active.");
        return;
    }

    res.statusCode = 404;
    res.end("Not Found");
});

const PORT = parseInt(process.env.PORT || "3000");
server.listen(PORT, () => {
    console.error(`Outlook MCP Server running on port ${PORT}`);
});
