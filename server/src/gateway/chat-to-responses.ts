/**
 * Convert Chat Completions streaming chunk to Responses API streaming event
 */
export function chatChunkToResponsesEvent(
  chunk: any,
  responseId: string,
  collectedContent: { text: string; toolCalls: any[] },
): any {
  const delta = chunk.choices?.[0]?.delta;
  const finishReason = chunk.choices?.[0]?.finish_reason;

  if (finishReason === 'stop' || finishReason === 'end_turn') {
    // Build the complete output for response.completed
    const output: any[] = [];

    if (collectedContent.text) {
      output.push({
        type: 'message',
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: collectedContent.text,
          },
        ],
      });
    }

    for (const tc of collectedContent.toolCalls) {
      output.push({
        type: 'function_call',
        id: tc.id,
        call_id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      });
    }

    return {
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        status: 'completed',
        model: chunk.model || '',
        output,
        usage: chunk.usage
          ? {
              input_tokens: chunk.usage.prompt_tokens || 0,
              output_tokens: chunk.usage.completion_tokens || 0,
              total_tokens: chunk.usage.total_tokens || 0,
            }
          : undefined,
      },
    };
  }

  if (delta?.content) {
    // Accumulate text content
    collectedContent.text += delta.content;
    return {
      type: 'response.output_text.delta',
      output_index: 0,
      content_index: 0,
      delta: delta.content,
    };
  }

  if (delta?.tool_calls) {
    const tc = delta.tool_calls[0];
    if (tc) {
      // Accumulate tool calls
      const existingTc = collectedContent.toolCalls.find(t => t.id === tc.id);
      if (existingTc) {
        if (tc.function?.arguments) {
          existingTc.arguments += tc.function.arguments;
        }
      } else {
        collectedContent.toolCalls.push({
          id: tc.id,
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || '',
        });
      }

      if (tc.function?.name) {
        return {
          type: 'response.function_call_arguments.delta',
          output_index: 0,
          call_id: tc.id,
          delta: tc.function.arguments || '',
        };
      }

      return {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        call_id: tc.id,
        delta: tc.function?.arguments || '',
      };
    }
  }

  // For role or other non-content deltas, just skip
  return null;
}
