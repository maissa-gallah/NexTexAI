import { STREAM_BOUNDARIES } from './constants';

const { START, MID, HEADER_END } = STREAM_BOUNDARIES;

/** Find a byte sequence inside a Uint8Array. Returns index or -1. */
export function findSequence(haystack, needle) {
  if (needle.length === 0) return 0;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

/** Concatenate two Uint8Arrays. */
export function concat(a, b) {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

/**
 * Consume a ReadableStream of multipart/x-mixed-replace data.
 * Calls onJson(parsed) for each JSON metadata frame and
 * onImage(jpegBytes) for each JPEG frame.
 */
export async function consumeStream(reader, onJson, onImage, signal) {
  let buffer = new Uint8Array(0);
  let state = 'finding_boundary';
  let contentType = '';

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer = concat(buffer, value);

    while (!signal.aborted) {
      if (state === 'finding_boundary') {
        const idx = findSequence(buffer, START);
        if (idx === -1) break;
        buffer = buffer.slice(idx + START.length);
        state = 'reading_headers';
      } else if (state === 'reading_headers') {
        const endIdx = findSequence(buffer, HEADER_END);
        if (endIdx === -1) break;
        const headerBytes = buffer.slice(0, endIdx);
        const headers = new TextDecoder().decode(headerBytes);
        const ctMatch = headers.match(/Content-Type:\s*(\S+)/i);
        contentType = ctMatch ? ctMatch[1].toLowerCase() : '';
        buffer = buffer.slice(endIdx + HEADER_END.length);
        state = 'reading_body';
      } else if (state === 'reading_body') {
        const boundaryPos = findSequence(buffer, MID);
        if (boundaryPos === -1) break;

        const body = buffer.slice(0, boundaryPos);

        if (contentType === 'application/json') {
          try {
            onJson(JSON.parse(new TextDecoder().decode(body)));
          } catch (_) { /* skip malformed JSON */ }
        } else if (contentType === 'image/jpeg') {
          onImage(body);
        }

        buffer = buffer.slice(boundaryPos + MID.length);
        state = 'reading_headers';
      }
    }
  }
}
