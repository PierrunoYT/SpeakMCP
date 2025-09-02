import OpenAI from "openai"
import { z } from "zod"
import { configStore } from "./config"

// Define the schema for LLM tool call responses
const LLMToolCallSchema = z.object({
  toolCalls: z
    .array(
      z.object({
        name: z.string(),
        arguments: z.record(z.any()),
      }),
    )
    .optional(),
  content: z.string().optional(),
  needsMoreWork: z.boolean().optional(),
})

export type LLMToolCallResponse = z.infer<typeof LLMToolCallSchema>

// Define the JSON schema for OpenAI structured output
const toolCallResponseSchema: OpenAI.ResponseFormatJSONSchema["json_schema"] = {
  name: "LLMToolCallResponse",
  description:
    "Response format for LLM tool calls with optional tool execution and content",
  schema: {
    type: "object",
    properties: {
      toolCalls: {
        type: "array",
        description: "Array of tool calls to execute",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the tool to call",
            },
            arguments: {
              type: "object",
              description: "Arguments to pass to the tool",
              additionalProperties: true,
            },
          },
          required: ["name", "arguments"],
          additionalProperties: false,
        },
      },
      content: {
        type: "string",
        description: "Text content of the response",
      },
      needsMoreWork: {
        type: "boolean",
        description: "Whether more work is needed after this response",
      },
    },
    additionalProperties: false,
  },
  strict: true,
}

// Context extraction schema
const ContextExtractionSchema = z.object({
  contextSummary: z.string(),
  resources: z.array(
    z.object({
      type: z.string(),
      id: z.string(),
      parameter: z.string(),
    }),
  ),
})

export type ContextExtractionResponse = z.infer<typeof ContextExtractionSchema>

const contextExtractionSchema: OpenAI.ResponseFormatJSONSchema["json_schema"] =
  {
    name: "ContextExtraction",
    description:
      "Extract context summary and resource identifiers from conversation",
    schema: {
      type: "object",
      properties: {
        contextSummary: {
          type: "string",
          description:
            "Brief summary of the current state and what has been accomplished",
        },
        resources: {
          type: "array",
          description:
            "Array of resource objects with type, id, and parameter information",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description:
                  "Type of resource (session, connection, handle, workspace, channel, other)",
              },
              id: {
                type: "string",
                description: "The actual ID value",
              },
              parameter: {
                type: "string",
                description:
                  "The parameter name this ID should be used for (e.g., sessionId, connectionId)",
              },
            },
            required: ["type", "id", "parameter"],
            additionalProperties: false,
          },
        },
      },
      required: ["contextSummary", "resources"],
      additionalProperties: false,
    },
    strict: true,
  }

/**
 * Create an OpenAI client instance based on the current configuration
 */
function createOpenAIClient(providerId?: string): OpenAI {
  const config = configStore.get()
  const chatProviderId = providerId || config.mcpToolsProviderId || "openai"

  const baseURL =
    chatProviderId === "groq"
      ? config.groqBaseUrl || "https://api.groq.com/openai/v1"
      : config.openaiBaseUrl || "https://api.openai.com/v1"

  const apiKey =
    chatProviderId === "groq" ? config.groqApiKey : config.openaiApiKey

  if (!apiKey) {
    throw new Error(`API key is required for ${chatProviderId}`)
  }

  return new OpenAI({
    baseURL,
    apiKey,
  })
}

/**
 * Get the appropriate model for the provider
 */
function getModel(
  providerId?: string,
  context: "mcp" | "transcript" = "mcp",
): string {
  const config = configStore.get()
  const chatProviderId = providerId || config.mcpToolsProviderId || "openai"

  if (context === "transcript") {
    return chatProviderId === "groq"
      ? config.transcriptPostProcessingGroqModel || "gemma2-9b-it"
      : config.transcriptPostProcessingOpenaiModel || "gpt-4o-mini"
  }

  return chatProviderId === "groq"
    ? config.mcpToolsGroqModel || "llama-3.3-70b-versatile"
    : config.mcpToolsOpenaiModel || "gpt-4o-mini"
}

/**
 * Check if a model is known to NOT support structured output with JSON schema
 * We use a blacklist approach - try structured output for all models except known incompatible ones
 */
function isKnownIncompatibleWithStructuredOutput(model: string): boolean {
  // Models that are known to not support JSON schema mode
  const incompatibleModels: string[] = [
    // Add specific models here that are known to fail with JSON schema
    // For now, we'll try structured output with all models
  ]

  return incompatibleModels.some((incompatible: string) =>
    model.toLowerCase().includes(incompatible.toLowerCase())
  )
}

/**
 * Check if we should attempt structured output for a model
 * Returns true for all models except those known to be incompatible
 */
function shouldAttemptStructuredOutput(model: string): boolean {
  return !isKnownIncompatibleWithStructuredOutput(model)
}

/**
 * Make a structured LLM call for tool responses
 */
export async function makeStructuredToolCall(
  messages: Array<{ role: string; content: string }>,
  providerId?: string,
): Promise<LLMToolCallResponse> {
  const config = configStore.get()
  const chatProviderId = providerId || config.mcpToolsProviderId || "openai"

  // For Gemini, fall back to the existing implementation
  if (chatProviderId === "gemini") {
    throw new Error("Gemini provider should use existing implementation")
  }

  const model = getModel(providerId, "mcp")
  const client = createOpenAIClient(providerId)

  try {
    // Try structured output for all models with fallback
    let response: OpenAI.Chat.Completions.ChatCompletion | null = null

    // First attempt: JSON Schema mode (for all models)
    if (shouldAttemptStructuredOutput(model)) {
      try {
        response = await client.chat.completions.create({
          model,
          messages:
            messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: toolCallResponseSchema,
          },
        })
      } catch (error: any) {
        // Check if this is a structured output related error
        const isStructuredOutputError = error.message?.includes("json_schema") ||
                                       error.message?.includes("response_format") ||
                                       error.message?.includes("schema") ||
                                       error.status === 400

        if (isStructuredOutputError) {
          console.log("JSON Schema mode failed, falling back to regular completion:", error.message)
          // Fall through to regular completion
        } else {
          // Non-structured-output error, re-throw
          throw error
        }
      }
    }

    // If structured output failed or wasn't attempted, try regular completion
    if (!response) {
      response = await client.chat.completions.create({
        model,
        messages:
          messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: 0,
      })
    }

      const content = response.choices[0]?.message.content
      if (content) {
        try {
          // Clean up malformed responses with various formatting issues
          let cleanContent = content.trim()

          // Remove common LLM formatting artifacts
          cleanContent = cleanContent
            .replace(/<\|[^|]*\|>/g, '') // Remove special tokens like <|tool_calls_section_begin|>
            .replace(/```json\s*/g, '') // Remove code block markers
            .replace(/```\s*/g, '')
            .replace(/^\s*[\w\s]*:\s*/, '') // Remove leading text like "Here's the response:"
            .trim()

          // Try to extract JSON object if embedded in text
          const jsonMatch = cleanContent.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            cleanContent = jsonMatch[0]
          }

          const parsed = JSON.parse(cleanContent)
          return LLMToolCallSchema.parse(parsed)
        } catch (parseError) {
          // If parsing fails completely, try to extract any meaningful content
          const textContent = content.replace(/<\|[^|]*\|>/g, '').trim()
          if (textContent) {
            return { content: textContent, needsMoreWork: true }
          }
        }
      }

    throw new Error("No response content received")
  } catch (error) {
    throw error
  }
}

/**
 * Make a structured LLM call for context extraction
 */
export async function makeStructuredContextExtraction(
  prompt: string,
  providerId?: string,
): Promise<ContextExtractionResponse> {
  const config = configStore.get()
  const chatProviderId = providerId || config.mcpToolsProviderId || "openai"

  const model = getModel(providerId, "mcp")
  const client = createOpenAIClient(providerId)

  try {
    // Try structured output for all models with fallback
    let response: OpenAI.Chat.Completions.ChatCompletion | null = null

    // First attempt: JSON Schema mode (for all models)
    if (shouldAttemptStructuredOutput(model)) {
      try {
        response = await client.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a context extraction assistant. Analyze conversation history and extract useful resource identifiers and context information.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: contextExtractionSchema,
          },
        })
      } catch (error: any) {
        // Check if this is a structured output related error
        const isStructuredOutputError = error.message?.includes("json_schema") ||
                                       error.message?.includes("response_format") ||
                                       error.message?.includes("schema") ||
                                       error.status === 400

        if (isStructuredOutputError) {
          console.log("JSON Schema mode failed for context extraction, falling back to regular completion:", error.message)
          // Fall through to regular completion
        } else {
          // Non-structured-output error, re-throw
          throw error
        }
      }
    }

    // If structured output failed or wasn't attempted, try regular completion
    if (!response) {
      response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a context extraction assistant. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
      })
    }

    const content = response.choices[0]?.message.content
    if (content) {
      try {
        const parsed = JSON.parse(content)
        return ContextExtractionSchema.parse(parsed)
      } catch (parseError) {}
    }

    return { contextSummary: "", resources: [] }
  } catch (error) {
    return { contextSummary: "", resources: [] }
  }
}

/**
 * Make a regular text completion call (for transcript processing)
 */
export async function makeTextCompletion(
  prompt: string,
  providerId?: string,
): Promise<string> {
  const config = configStore.get()
  const chatProviderId =
    providerId || config.transcriptPostProcessingProviderId || "openai"

  const model = getModel(providerId, "transcript")
  const client = createOpenAIClient(providerId)

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: prompt,
      },
    ],
    temperature: 0,
  })

  return response.choices[0]?.message.content?.trim() || ""
}
