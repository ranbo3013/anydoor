/**
 * Convert Chat Completions streaming chunks to Responses API streaming events.
 * 
 * The Responses API expects a specific sequence of SSE events:
 * 
 * For text + tool_calls:
 *   response.created
 *   response.in_progress
 *   response.output_item.added        (output_index=0, message with text)
 *   response.content_part.added
 *   response.output_text.delta        (multiple)
 *   response.output_text.done
 *   response.content_part.done
 *   response.output_item.done          (output_index=0)
 *   response.output_item.added        (output_index=1, function_call)
 *   response.function_call_arguments.delta  (multiple)
 *   response.function_call_arguments.done
 *   response.output_item.done          (output_index=1)
 *   response.completed
 */

export interface CollectedContent {
  text: string;
  toolCalls: { id: string; callId: string; name: string; arguments: string }[];
}

/** A single SSE event with both event type and data */
export interface SseEvent {
  eventType: string;
  data: object;
}

let seqNum = 0;

function nextSeq(): number {
  return ++seqNum;
}

/** Reset sequence number for a new stream */
export function resetSeq(): void {
  seqNum = 0;
}

// ─── Event builders ───────────────────────────────────────────

export function buildResponseCreated(responseId: string, model: string): SseEvent {
  const now = Math.floor(Date.now() / 1000);
  return {
    eventType: 'response.created',
    data: {
      type: 'response.created',
      sequence_number: nextSeq(),
      response: {
        id: responseId, object: 'response', created_at: now,
        status: 'in_progress', error: null, incomplete_details: null,
        instructions: null, max_output_tokens: null, model,
        output: [], parallel_tool_calls: true, previous_response_id: null,
        reasoning: { effort: null, summary: null }, store: true,
        temperature: 1, text: { format: { type: 'text' } },
        tool_choice: 'auto', tools: [], top_p: 1,
        truncation: 'disabled', usage: null, user: null, metadata: {},
      },
    },
  };
}

export function buildResponseInProgress(responseId: string, model: string): SseEvent {
  const now = Math.floor(Date.now() / 1000);
  return {
    eventType: 'response.in_progress',
    data: {
      type: 'response.in_progress',
      sequence_number: nextSeq(),
      response: {
        id: responseId, object: 'response', created_at: now,
        status: 'in_progress', error: null, incomplete_details: null,
        instructions: null, max_output_tokens: null, model,
        output: [], parallel_tool_calls: true, previous_response_id: null,
        reasoning: { effort: null, summary: null }, store: true,
        temperature: 1, text: { format: { type: 'text' } },
        tool_choice: 'auto', tools: [], top_p: 1,
        truncation: 'disabled', usage: null, user: null, metadata: {},
      },
    },
  };
}

/** Build response.output_item.added for a MESSAGE output item (text content) */
export function buildMessageOutputItemAdded(responseId: string, outputIndex: number): SseEvent {
  const msgId = `msg_${Date.now()}`;
  return {
    eventType: 'response.output_item.added',
    data: {
      type: 'response.output_item.added',
      sequence_number: nextSeq(),
      output_index: outputIndex,
      item: { id: msgId, type: 'message', role: 'assistant', content: [] },
    },
  };
}

/** Build response.output_item.added for a FUNCTION_CALL output item */
export function buildFunctionCallOutputItemAdded(
  outputIndex: number, callId: string, functionName: string,
): SseEvent {
  const fcId = `fc_${Date.now()}`;
  return {
    eventType: 'response.output_item.added',
    data: {
      type: 'response.output_item.added',
      sequence_number: nextSeq(),
      output_index: outputIndex,
      item: {
        type: 'function_call',
        id: fcId,
        call_id: callId,
        name: functionName,
        arguments: '',
      },
    },
  };
}

/** Build response.content_part.added for a text content part */
export function buildContentPartAdded(outputIndex: number): SseEvent {
  return {
    eventType: 'response.content_part.added',
    data: {
      type: 'response.content_part.added',
      sequence_number: nextSeq(),
      output_index: outputIndex,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    },
  };
}

/** Build response.output_text.delta */
export function buildOutputTextDelta(text: string, outputIndex: number): SseEvent {
  return {
    eventType: 'response.output_text.delta',
    data: {
      type: 'response.output_text.delta',
      sequence_number: nextSeq(),
      output_index: outputIndex,
      content_index: 0,
      delta: text,
    },
  };
}

/** Build response.output_text.done */
export function buildOutputTextDone(text: string, outputIndex: number): SseEvent {
  return {
    eventType: 'response.output_text.done',
    data: {
      type: 'response.output_text.done',
      sequence_number: nextSeq(),
      output_index: outputIndex,
      content_index: 0,
      text, annotations: [],
    },
  };
}

/** Build response.content_part.done */
export function buildContentPartDone(text: string, outputIndex: number): SseEvent {
  return {
    eventType: 'response.content_part.done',
    data: {
      type: 'response.content_part.done',
      sequence_number: nextSeq(),
      output_index: outputIndex,
      content_index: 0,
      part: { type: 'output_text', text, annotations: [] },
    },
  };
}

/** Build response.output_item.done for a MESSAGE output item */
export function buildMessageOutputItemDone(text: string, outputIndex: number): SseEvent {
  const msgId = `msg_${Date.now()}`;
  return {
    eventType: 'response.output_item.done',
    data: {
      type: 'response.output_item.done',
      sequence_number: nextSeq(),
      output_index: outputIndex,
      item: {
        id: msgId, type: 'message', role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    },
  };
}

/** Build response.function_call_arguments.delta */
export function buildFunctionCallArgsDelta(callId: string, argsDelta: string, outputIndex: number): SseEvent {
  return {
    eventType: 'response.function_call_arguments.delta',
    data: {
      type: 'response.function_call_arguments.delta',
      sequence_number: nextSeq(),
      output_index: outputIndex,
      call_id: callId,
      delta: argsDelta,
    },
  };
}

/** Build response.function_call_arguments.done */
export function buildFunctionCallArgsDone(callId: string, args: string, outputIndex: number): SseEvent {
  return {
    eventType: 'response.function_call_arguments.done',
    data: {
      type: 'response.function_call_arguments.done',
      sequence_number: nextSeq(),
      output_index: outputIndex,
      call_id: callId,
      arguments: args,
    },
  };
}

/** Build response.output_item.done for a FUNCTION_CALL output item */
export function buildFunctionCallOutputItemDone(
  outputIndex: number, callId: string, functionName: string, args: string,
): SseEvent {
  const fcId = `fc_${Date.now()}`;
  return {
    eventType: 'response.output_item.done',
    data: {
      type: 'response.output_item.done',
      sequence_number: nextSeq(),
      output_index: outputIndex,
      item: {
        type: 'function_call',
        id: fcId,
        call_id: callId,
        name: functionName,
        arguments: args,
      },
    },
  };
}

/** Build the final response.completed event */
export function buildResponseCompleted(
  responseId: string, model: string, collectedContent: CollectedContent,
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
): SseEvent {
  const now = Math.floor(Date.now() / 1000);
  const msgId = `msg_${Date.now()}`;

  const output: any[] = [];
  let outputIndex = 0;

  // Build message output item (text)
  if (collectedContent.text) {
    output.push({
      id: msgId, type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: collectedContent.text, annotations: [] }],
    });
    outputIndex++;
  }

  // Build function call output items
  for (const tc of collectedContent.toolCalls) {
    output.push({
      type: 'function_call',
      id: `fc_${Date.now()}_${outputIndex}`,
      call_id: tc.callId,
      name: tc.name,
      arguments: tc.arguments,
    });
    outputIndex++;
  }

  return {
    eventType: 'response.completed',
    data: {
      type: 'response.completed',
      sequence_number: nextSeq(),
      response: {
        id: responseId, object: 'response', created_at: now,
        completed_at: now, status: 'completed',
        error: null, incomplete_details: null,
        instructions: null, max_output_tokens: null, model,
        output, parallel_tool_calls: true, previous_response_id: null,
        reasoning: { effort: null, summary: null }, store: false,
        temperature: 1, text: { format: { type: 'text' } },
        tool_choice: 'auto', tools: [], top_p: 1,
        truncation: 'disabled',
        usage: usage
          ? {
              input_tokens: usage.prompt_tokens || 0,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens: usage.completion_tokens || 0,
              output_tokens_details: { reasoning_tokens: 0 },
              total_tokens: usage.total_tokens || 0,
            }
          : { input_tokens: 0, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 0 },
        user: null, metadata: {},
      },
    },
  };
}

// ─── Stream state ────────────────────────────────────────────

export interface StreamState {
  collectedContent: CollectedContent;
  /** Whether we've emitted output_item.added for the message (text) part */
  hasStartedTextOutput: boolean;
  /** Whether we've emitted content_part.added */
  hasStartedContent: boolean;
  /** Whether the text output item has been closed */
  textOutputClosed: boolean;
  /** Set of tool call IDs that have had output_item.added emitted */
  functionCallOutputsStarted: Set<string>;
  /** Current output index counter */
  nextOutputIndex: number;
  /** Tracked usage from stream chunks */
  usage: { inputTokens: number; outputTokens: number } | null;
}

export function createStreamState(): StreamState {
  return {
    collectedContent: { text: '', toolCalls: [] },
    hasStartedTextOutput: false,
    hasStartedContent: false,
    textOutputClosed: false,
    functionCallOutputsStarted: new Set(),
    nextOutputIndex: 0,
    usage: null,
  };
}

// ─── Main chunk processor ────────────────────────────────────

/**
 * Process a Chat Completions streaming chunk and return the corresponding
 * Responses API events. May return 0, 1, or multiple events per chunk.
 */
export function processChatChunk(
  chunk: any,
  responseId: string,
  model: string,
  state: StreamState,
): SseEvent[] {
  const events: SseEvent[] = [];
  const delta = chunk.choices?.[0]?.delta;
  const finishReason = chunk.choices?.[0]?.finish_reason;
  const chunkUsage = chunk.usage;

  // Track usage from stream chunks
  if (chunkUsage) {
    state.usage = {
      inputTokens: chunkUsage.prompt_tokens || 0,
      outputTokens: chunkUsage.completion_tokens || chunkUsage.total_tokens
        ? chunkUsage.total_tokens - (chunkUsage.prompt_tokens || 0)
        : 0,
    };
  }

  // ── Handle text content delta ──
  if (delta?.content) {
    // Start text output if not started
    if (!state.hasStartedTextOutput) {
      state.hasStartedTextOutput = true;
      events.push(buildMessageOutputItemAdded(responseId, state.nextOutputIndex));
      state.nextOutputIndex++;
      events.push(buildContentPartAdded(state.nextOutputIndex - 1));
      state.hasStartedContent = true;
    }
    state.collectedContent.text += delta.content;
    events.push(buildOutputTextDelta(delta.content, state.nextOutputIndex - 1));
  }

  // ── Handle tool calls delta ──
  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      const tcIndex = tc.index ?? 0;
      const functionName = tc.function?.name || '';
      const argsDelta = tc.function?.arguments || '';

      // Close text output if still open
      if (state.hasStartedTextOutput && !state.textOutputClosed) {
        state.textOutputClosed = true;
        const textIdx = state.nextOutputIndex - 1;
        events.push(buildOutputTextDone(state.collectedContent.text, textIdx));
        events.push(buildContentPartDone(state.collectedContent.text, textIdx));
        events.push(buildMessageOutputItemDone(state.collectedContent.text, textIdx));
      }

      // Find or create tool call by INDEX (not id — streaming chunks only have id in the first chunk)
      let existingTc = state.collectedContent.toolCalls[tcIndex];
      if (!existingTc) {
        // First chunk for this tool call — it should have the id and name
        const callId = tc.id || `call_${tcIndex}`;
        existingTc = { id: tc.id || `tc_${tcIndex}`, callId, name: functionName, arguments: '' };
        state.collectedContent.toolCalls[tcIndex] = existingTc;
      } else if (tc.id) {
        // Update id if this chunk has it (shouldn't happen but be safe)
        existingTc.id = tc.id;
        existingTc.callId = tc.id;
      }
      if (functionName && !existingTc.name) {
        existingTc.name = functionName;
      }
      if (argsDelta) {
        existingTc.arguments += argsDelta;
      }

      // Start function call output if not started
      if (!state.functionCallOutputsStarted.has(existingTc.callId)) {
        state.functionCallOutputsStarted.add(existingTc.callId);
        const fcOutputIdx = state.nextOutputIndex;
        state.nextOutputIndex++;
        events.push(buildFunctionCallOutputItemAdded(fcOutputIdx, existingTc.callId, existingTc.name));
      }

      // Emit arguments delta
      if (argsDelta) {
        const fcOutputIdx = getOutputIndexForCallId(state, existingTc.callId);
        events.push(buildFunctionCallArgsDelta(existingTc.callId, argsDelta, fcOutputIdx));
      }
    }
  }

  // ── Handle finish ──
  if (finishReason === 'stop' || finishReason === 'end_turn' || finishReason === 'tool_calls') {
    // Close text output if still open
    if (state.hasStartedTextOutput && !state.textOutputClosed) {
      state.textOutputClosed = true;
      const textIdx = 0; // text is always output_index 0
      events.push(buildOutputTextDone(state.collectedContent.text, textIdx));
      events.push(buildContentPartDone(state.collectedContent.text, textIdx));
      events.push(buildMessageOutputItemDone(state.collectedContent.text, textIdx));
    }

    // Close all function call outputs
    for (const tc of state.collectedContent.toolCalls) {
      const fcOutputIdx = getOutputIndexForCallId(state, tc.callId);
      events.push(buildFunctionCallArgsDone(tc.callId, tc.arguments, fcOutputIdx));
      events.push(buildFunctionCallOutputItemDone(fcOutputIdx, tc.callId, tc.name, tc.arguments));
    }

    // Final response.completed
    events.push(buildResponseCompleted(responseId, model, state.collectedContent, chunkUsage));
  }

  return events;
}

/** Get the output_index for a function call by its callId */
function getOutputIndexForCallId(state: StreamState, callId: string): number {
  const callIdx = state.collectedContent.toolCalls.findIndex(t => t?.callId === callId);
  // text output is index 0 (if present), function calls start after
  const textOffset = state.hasStartedTextOutput ? 1 : 0;
  return textOffset + callIdx;
}

/**
 * Format an SseEvent as a proper SSE string with both event: and data: lines.
 */
export function formatSseEvent(event: SseEvent): string {
  return `event: ${event.eventType}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
