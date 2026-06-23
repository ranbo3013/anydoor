/**
 * Convert Chat Completions streaming chunks to Responses API streaming events.
 *
 * The Responses API expects a specific sequence of semantic events with proper SSE format:
 * 
 * event: response.created
 * data: {"type":"response.created",...}
 *
 * event: response.in_progress
 * data: {"type":"response.in_progress",...}
 *
 * event: response.output_item.added
 * data: {"type":"response.output_item.added",...}
 * 
 * ... etc
 */

export interface CollectedContent {
  text: string;
  toolCalls: { id: string; name: string; arguments: string }[];
}

/** A single SSE event with both event type and data */
export interface SseEvent {
  eventType: string;  // The event: line value
  data: object;       // The data: line value
}

let seqNum = 0;

function nextSeq(): number {
  return ++seqNum;
}

/** Reset sequence number for a new stream */
export function resetSeq(): void {
  seqNum = 0;
}

/** Build the response.created event */
export function buildResponseCreated(responseId: string, model: string): SseEvent {
  const now = Math.floor(Date.now() / 1000);
  return {
    eventType: 'response.created',
    data: {
      type: 'response.created',
      sequence_number: nextSeq(),
      response: {
        id: responseId,
        object: 'response',
        created_at: now,
        status: 'in_progress',
        error: null,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: null,
        model,
        output: [],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: true,
        temperature: 1,
        text: { format: { type: 'text' } },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: null,
        user: null,
        metadata: {},
      },
    },
  };
}

/** Build the response.in_progress event */
export function buildResponseInProgress(responseId: string, model: string): SseEvent {
  const now = Math.floor(Date.now() / 1000);
  return {
    eventType: 'response.in_progress',
    data: {
      type: 'response.in_progress',
      sequence_number: nextSeq(),
      response: {
        id: responseId,
        object: 'response',
        created_at: now,
        status: 'in_progress',
        error: null,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: null,
        model,
        output: [],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: true,
        temperature: 1,
        text: { format: { type: 'text' } },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: null,
        user: null,
        metadata: {},
      },
    },
  };
}

/** Build response.output_item.added for a message output item */
export function buildOutputItemAdded(responseId: string, model: string): SseEvent {
  const msgId = `msg_${Date.now()}`;
  return {
    eventType: 'response.output_item.added',
    data: {
      type: 'response.output_item.added',
      sequence_number: nextSeq(),
      output_index: 0,
      item: {
        id: msgId,
        type: 'message',
        role: 'assistant',
        content: [],
      },
    },
  };
}

/** Build response.content_part.added for a text content part */
export function buildContentPartAdded(): SseEvent {
  return {
    eventType: 'response.content_part.added',
    data: {
      type: 'response.content_part.added',
      sequence_number: nextSeq(),
      output_index: 0,
      content_index: 0,
      part: {
        type: 'output_text',
        text: '',
        annotations: [],
      },
    },
  };
}

/** Build response.output_text.delta */
export function buildOutputTextDelta(text: string): SseEvent {
  return {
    eventType: 'response.output_text.delta',
    data: {
      type: 'response.output_text.delta',
      sequence_number: nextSeq(),
      output_index: 0,
      content_index: 0,
      delta: text,
    },
  };
}

/** Build response.output_text.done */
export function buildOutputTextDone(text: string): SseEvent {
  return {
    eventType: 'response.output_text.done',
    data: {
      type: 'response.output_text.done',
      sequence_number: nextSeq(),
      output_index: 0,
      content_index: 0,
      text,
      annotations: [],
    },
  };
}

/** Build response.content_part.done */
export function buildContentPartDone(text: string): SseEvent {
  return {
    eventType: 'response.content_part.done',
    data: {
      type: 'response.content_part.done',
      sequence_number: nextSeq(),
      output_index: 0,
      content_index: 0,
      part: {
        type: 'output_text',
        text,
        annotations: [],
      },
    },
  };
}

/** Build response.output_item.done */
export function buildOutputItemDone(text: string): SseEvent {
  const msgId = `msg_${Date.now()}`;
  return {
    eventType: 'response.output_item.done',
    data: {
      type: 'response.output_item.done',
      sequence_number: nextSeq(),
      output_index: 0,
      item: {
        id: msgId,
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text,
            annotations: [],
          },
        ],
      },
    },
  };
}

/** Build response.function_call_arguments.delta */
export function buildFunctionCallArgsDelta(callId: string, argsDelta: string): SseEvent {
  return {
    eventType: 'response.function_call_arguments.delta',
    data: {
      type: 'response.function_call_arguments.delta',
      sequence_number: nextSeq(),
      output_index: 0,
      call_id: callId,
      delta: argsDelta,
    },
  };
}

/** Build response.function_call_arguments.done */
export function buildFunctionCallArgsDone(callId: string, args: string): SseEvent {
  return {
    eventType: 'response.function_call_arguments.done',
    data: {
      type: 'response.function_call_arguments.done',
      sequence_number: nextSeq(),
      output_index: 0,
      call_id: callId,
      arguments: args,
    },
  };
}

/** Build the final response.completed event */
export function buildResponseCompleted(
  responseId: string,
  model: string,
  collectedContent: CollectedContent,
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
): SseEvent {
  const now = Math.floor(Date.now() / 1000);
  const msgId = `msg_${Date.now()}`;

  const output: any[] = [];

  // Build message output item
  if (collectedContent.text || collectedContent.toolCalls.length === 0) {
    output.push({
      id: msgId,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: collectedContent.text,
          annotations: [],
        },
      ],
    });
  }

  // Build function call output items
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
    eventType: 'response.completed',
    data: {
      type: 'response.completed',
      sequence_number: nextSeq(),
      response: {
        id: responseId,
        object: 'response',
        created_at: now,
        completed_at: now,
        status: 'completed',
        error: null,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: null,
        model,
        output,
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: false,
        temperature: 1,
        text: { format: { type: 'text' } },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: usage
          ? {
              input_tokens: usage.prompt_tokens || 0,
              output_tokens: usage.completion_tokens || 0,
              output_tokens_details: { reasoning_tokens: 0 },
              total_tokens: usage.total_tokens || 0,
            }
          : { input_tokens: 0, output_tokens: 0, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 0 },
        user: null,
        metadata: {},
      },
    },
  };
}

/**
 * Process a Chat Completions streaming chunk and return the corresponding
 * Responses API events. May return 0, 1, or multiple events per chunk.
 */
export function processChatChunk(
  chunk: any,
  responseId: string,
  model: string,
  state: {
    collectedContent: CollectedContent;
    hasStartedOutput: boolean;
    hasStartedContent: boolean;
  },
): SseEvent[] {
  const events: SseEvent[] = [];
  const delta = chunk.choices?.[0]?.delta;
  const finishReason = chunk.choices?.[0]?.finish_reason;
  const chunkUsage = chunk.usage;

  // On first content, emit output_item.added and content_part.added
  if (!state.hasStartedOutput && (delta?.content || delta?.tool_calls || delta?.role)) {
    state.hasStartedOutput = true;
    events.push(buildOutputItemAdded(responseId, model));

    if (!state.hasStartedContent) {
      state.hasStartedContent = true;
      events.push(buildContentPartAdded());
    }
  }

  // Handle text content delta
  if (delta?.content) {
    state.collectedContent.text += delta.content;
    events.push(buildOutputTextDelta(delta.content));
  }

  // Handle tool calls delta
  if (delta?.tool_calls) {
    const tc = delta.tool_calls[0];
    if (tc) {
      const existingTc = state.collectedContent.toolCalls.find(t => t.id === tc.id);
      if (existingTc) {
        if (tc.function?.arguments) {
          existingTc.arguments += tc.function.arguments;
        }
      } else {
        state.collectedContent.toolCalls.push({
          id: tc.id,
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || '',
        });
      }
      events.push(buildFunctionCallArgsDelta(tc.id, tc.function?.arguments || ''));
    }
  }

  // Handle finish
  if (finishReason === 'stop' || finishReason === 'end_turn') {
    // Close text content
    if (state.hasStartedContent) {
      events.push(buildOutputTextDone(state.collectedContent.text));
      events.push(buildContentPartDone(state.collectedContent.text));
    }

    // Close function calls
    for (const tc of state.collectedContent.toolCalls) {
      events.push(buildFunctionCallArgsDone(tc.id, tc.arguments));
    }

    // Close output item
    if (state.hasStartedOutput) {
      events.push(buildOutputItemDone(state.collectedContent.text));
    }

    // Final response.completed
    events.push(buildResponseCompleted(responseId, model, state.collectedContent, chunkUsage));
  }

  return events;
}

/**
 * Format an SseEvent as a proper SSE string with both event: and data: lines.
 * 
 * SSE format:
 * event: response.created\n
 * data: {"type":"response.created",...}\n
 * \n
 */
export function formatSseEvent(event: SseEvent): string {
  return `event: ${event.eventType}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
