#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Definition of the Perplexica Ask Tool.
 * This tool accepts an array of messages and returns a search response
 * from the Perplexica Search API, with citations appended to the message if provided.
 */
const PERPLEXICA_ASK_TOOL: Tool = {
  name: "perplexica_ask",
  description:
    "Engages in a conversation using the Perplexica Search API. " +
    "Accepts an array of messages (each with a role and content) " +
    "and returns a search response with citations from the Perplexica API.",
  inputSchema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: {
              type: "string",
              description:
                "Role of the message (e.g., system, user, assistant)",
            },
            content: {
              type: "string",
              description: "The content of the message",
            },
          },
          required: ["role", "content"],
        },
        description: "Array of conversation messages",
      },
    },
    required: ["messages"],
  },
};

// Retrieve the Perplexica API key from environment variables (optional)
const PERPLEXICA_API_KEY = process.env.PERPLEXICA_API_KEY;

/**
 * Performs a search-based chat completion by sending a request to the Perplexica Search API.
 * It converts an array of messages into a query and conversation history, then appends citations
 * to the returned message if provided.
 *
 * @param {Array<{ role: string; content: string }>} messages - An array of message objects.
 * @returns {Promise<string>} The search result with appended citations.
 * @throws Will throw an error if the API request fails.
 */
async function performChatCompletion(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  if (messages.length === 0) {
    throw new Error("No messages provided");
  }

  // Use the last message as the query; convert earlier messages into history.
  const queryMessage = messages[messages.length - 1];
  const historyMessages = messages.slice(0, messages.length - 1);

  // Convert history messages: convert "user" to "human", retain "assistant", ignore "system".
  const convertedHistory = historyMessages
    .map((msg) => {
      if (msg.role === "user") {
        return ["human", msg.content];
      } else if (msg.role === "assistant") {
        return ["assistant", msg.content];
      }
      return null; // Skip messages with roles like "system"
    })
    .filter((pair) => pair !== null);

  // Construct the request body as per the new API specification
  const body = {
    chatModel: {
      provider: "openai",
      model: "gpt-4o-mini",
    },
    embeddingModel: {
      provider: "openai",
      model: "text-embedding-3-large",
    },
    optimizationMode: "speed",
    focusMode: "webSearch",
    query: queryMessage.content,
    history: convertedHistory,
  };

  // Construct the new API endpoint URL
  const url = new URL("https://perplexica.knaxx.com/api/search");

  // Build headers, including Authorization only if the API key is provided.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (PERPLEXICA_API_KEY) {
    headers["Authorization"] = `Bearer ${PERPLEXICA_API_KEY}`;
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(
      `Network error while calling Perplexica API: ${error}`
    );
  }

  if (!response.ok) {
    let errorText;
    try {
      errorText = await response.text();
    } catch (parseError) {
      errorText = "Unable to parse error response";
    }
    throw new Error(
      `Perplexica API error: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (jsonError) {
    throw new Error(
      `Failed to parse JSON response from Perplexica API: ${jsonError}`
    );
  }

  // Retrieve the final message and append citations if sources are provided
  let messageContent = data.message;
  if (data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
    messageContent += "\n\nCitations:\n";
    data.sources.forEach((source: any, index: number) => {
      if (
        source.metadata &&
        source.metadata.title &&
        source.metadata.url
      ) {
        messageContent += `[${index + 1}] ${source.metadata.title} - ${source.metadata.url}\n`;
      } else {
        messageContent += `[${index + 1}] ${source.pageContent}\n`;
      }
    });
  }

  return messageContent;
}

// Initialize the server with tool metadata and capabilities
const server = new Server(
  {
    name: "example-servers/perplexica-ask",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Registers a handler for listing available tools.
 * When the client requests a list of tools, this handler returns the Perplexica Ask Tool.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [PERPLEXICA_ASK_TOOL],
}));

/**
 * Registers a handler for calling a specific tool.
 * Processes requests by validating input and invoking the appropriate tool.
 *
 * @param {object} request - The incoming tool call request.
 * @returns {Promise<object>} The response containing the tool's result or an error.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    if (!args) {
      throw new Error("No arguments provided");
    }
    switch (name) {
      case "perplexica_ask": {
        if (!Array.isArray(args.messages)) {
          throw new Error(
            "Invalid arguments for perplexica-ask: 'messages' must be an array"
          );
        }
        const messages = args.messages;
        const result = await performChatCompletion(messages);
        return {
          content: [{ type: "text", text: result }],
          isError: false,
        };
      }
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Initializes and runs the server using standard I/O for communication.
 * Logs an error and exits if the server fails to start.
 */
async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Perplexica Ask MCP Server running on stdio");
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

// Start the server and catch any startup errors
runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
