import {
  focusManager,
  QueryClient,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { tipcClient } from "./tipc-client"
import { Conversation, ConversationHistoryItem } from "@shared/types"

focusManager.setEventListener((handleFocus) => {
  const handler = () => handleFocus()
  window.addEventListener("focus", handler)
  return () => {
    window.removeEventListener("focus", handler)
  }
})

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
    },
  },
})

export const useMicrphoneStatusQuery = () =>
  useQuery({
    queryKey: ["microphone-status"],
    queryFn: async () => {
      return tipcClient.getMicrophoneStatus()
    },
  })

export const useConfigQuery = () =>
  useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      return tipcClient.getConfig()
    },
  })

export const useConversationHistoryQuery = () =>
  useQuery({
    queryKey: ["conversation-history"],
    queryFn: async () => {
      const result = await tipcClient.getConversationHistory()
      return result
    },
  })

export const useConversationQuery = (conversationId: string | null) =>
  useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null
      const result = await tipcClient.loadConversation({ conversationId })
      return result
    },
    enabled: !!conversationId,
  })

export const useSaveConversationMutation = () =>
  useMutation({
    mutationFn: async ({ conversation }: { conversation: any }) => {
      await tipcClient.saveConversation({ conversation })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-history"] })
    },
  })

export const useCreateConversationMutation = () =>
  useMutation({
    mutationFn: async ({
      firstMessage,
      role,
    }: {
      firstMessage: string
      role?: "user" | "assistant"
    }) => {
      const result = await tipcClient.createConversation({ firstMessage, role })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-history"] })
    },
  })

export const useAddMessageToConversationMutation = () =>
  useMutation({
    mutationFn: async ({
      conversationId,
      content,
      role,
      toolCalls,
      toolResults,
    }: {
      conversationId: string
      content: string
      role: "user" | "assistant" | "tool"
      toolCalls?: Array<{ name: string; arguments: any }>
      toolResults?: Array<{ success: boolean; content: string; error?: string }>
    }) => {
      return tipcClient.addMessageToConversation({
        conversationId,
        content,
        role,
        toolCalls,
        toolResults,
      })
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["conversation", variables.conversationId],
      })
      queryClient.invalidateQueries({ queryKey: ["conversation-history"] })
    },
  })

export const useDeleteConversationMutation = () =>
  useMutation({
    mutationFn: async (conversationId: string) => {
      return tipcClient.deleteConversation({ conversationId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-history"] })
    },
  })

export const useDeleteAllConversationsMutation = () =>
  useMutation({
    mutationFn: async () => {
      return tipcClient.deleteAllConversations()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-history"] })
      queryClient.invalidateQueries({ queryKey: ["conversation"] })
    },
  })

// History-themed aliases for better semantic naming
export const useHistoryQuery = useConversationHistoryQuery
export const useHistoryItemQuery = useConversationQuery
export const useDeleteHistoryItemMutation = useDeleteConversationMutation
export const useDeleteAllHistoryMutation = useDeleteAllConversationsMutation

export const useSaveConfigMutation = () =>
  useMutation({
    mutationFn: tipcClient.saveConfig,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["config"],
      })
    },
  })

export const useAvailableModelsQuery = (
  providerId: string,
  enabled: boolean = true,
) =>
  useQuery({
    queryKey: ["available-models", providerId],
    queryFn: async () => {
      return tipcClient.fetchAvailableModels({ providerId })
    },
    enabled: enabled && !!providerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
