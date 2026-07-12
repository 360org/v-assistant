/**
 * DB barrel export.
 */
export { openInboundDb, getInboundDb, getOutboundDb, ensureIpcDir, touchHeartbeat, clearStaleProcessingAcks, closeAll, createInboundSchema } from './connection.js';
export { getPendingMessages, markProcessing, markCompleted, setMaxMessagesPerPrompt, type MessageInRow } from './messages-in.js';
export { writeMessageOut, getMessageIdBySeq, getRoutingBySeq, type MessageOutRow, type WriteMessageOut } from './messages-out.js';
export { getSessionState, setSessionState, deleteSessionState, getContinuation, setContinuation, clearContinuation, setCurrentInReplyTo, getCurrentInReplyTo, clearCurrentInReplyTo } from './session-state.js';
