# Real-Time AI Voice Assistant Build Plan
## Twilio Media Streams + OpenAI Realtime API Implementation

**Total Estimated Time: 12-18 hours** (1.5-2.5 days of focused work)

---

## Milestone 1: Project Setup & Infrastructure
**Estimated Time: 2-3 hours**

### Tasks:
- [ ] Set up development environment (Node.js/Python server)
- [ ] Install dependencies (Twilio SDK, OpenAI SDK, WebSocket libraries)
- [ ] Set up HTTP tunneling (ngrok) for local development
- [ ] Configure Twilio account and purchase/configure phone number
- [ ] Set up environment variables (API keys)
- [ ] Create basic project structure

**Deliverable:** Server running locally with ngrok tunnel, basic hello world endpoint

---

## Milestone 2: Twilio Phone Number & Webhook Setup
**Estimated Time: 1-2 hours**

### Tasks:
- [ ] Purchase Twilio phone number (or use existing)
- [ ] Configure Voice webhook URL (`/incoming-call` endpoint)
- [ ] Implement basic TwiML response endpoint
- [ ] Test phone number receiving calls
- [ ] Verify ngrok tunnel is accessible from Twilio

**Deliverable:** Incoming calls connect to your server, basic greeting plays

---

## Milestone 3: TwiML Media Stream Connection
**Estimated Time: 2-3 hours**

### Tasks:
- [ ] Implement TwiML `<connect><stream>` response
- [ ] Set up WebSocket endpoint (`/media-stream`)
- [ ] Handle Twilio WebSocket connection handshake
- [ ] Parse Twilio `start` event and extract `streamSid`
- [ ] Handle Twilio audio format (8 kHz mu-law/PCMU)
- [ ] Test WebSocket connection establishes successfully

**Deliverable:** Twilio successfully connects WebSocket, receives `start` event

---

## Milestone 4: OpenAI Realtime API Connection
**Estimated Time: 2-3 hours**

### Tasks:
- [ ] Implement OpenAI Realtime WebSocket client connection
- [ ] Handle authentication (Bearer token)
- [ ] Send `session.update` configuration message
- [ ] Configure audio format (8 kHz mu-law/PCMU) to match Twilio
- [ ] Set model (`gpt-4o-realtime-preview` or `gpt-realtime`)
- [ ] Handle OpenAI session confirmation
- [ ] Test bidirectional WebSocket connection

**Deliverable:** OpenAI connection established, session configured, ready for audio

---

## Milestone 5: Audio Bridge Implementation
**Estimated Time: 3-4 hours** (Most Complex)

### Tasks:
- [ ] Implement Twilio → OpenAI audio forwarding
  - Parse Twilio `media` events (base64 audio frames)
  - Convert mu-law to format OpenAI expects (if needed)
  - Send audio chunks to OpenAI via `input_audio_buffer.append`
- [ ] Implement OpenAI → Twilio audio forwarding
  - Receive OpenAI `response.audio_transcript.delta` events
  - Convert audio format back to mu-law
  - Send audio frames to Twilio via WebSocket `media` message
- [ ] Handle audio format conversions
- [ ] Test basic audio loopback (hear your voice back)

**Deliverable:** Audio flows bidirectionally, you can hear yourself speak

---

## Milestone 6: AI Conversation Logic
**Estimated Time: 2-3 hours**

### Tasks:
- [ ] Design system prompt for pizza ordering assistant
- [ ] Implement menu context in initial `session.update`
- [ ] Handle OpenAI `response.audio_transcript` events
- [ ] Implement order state tracking
- [ ] Handle conversation flow (ordering, confirmation, etc.)
- [ ] Test basic conversation (AI understands and responds)

**Deliverable:** AI can have a basic conversation about pizza ordering

---

## Milestone 7: Interruption (Barge-in) Handling
**Estimated Time: 1-2 hours**

### Tasks:
- [ ] Detect when caller starts speaking (Twilio `media` events resume)
- [ ] Send `{"event": "clear"}` to Twilio to stop buffered audio
- [ ] Send `conversation.item.truncate` to OpenAI to stop response
- [ ] Test interruption works smoothly
- [ ] Handle edge cases (multiple interruptions)

**Deliverable:** Caller can interrupt AI mid-sentence, AI stops and listens

---

## Milestone 8: Order State Management & Completion
**Estimated Time: 2-3 hours**

### Tasks:
- [ ] Implement order state tracking (items, quantities, sizes)
- [ ] Handle order completion detection
- [ ] Calculate totals with tax (8% NYS)
- [ ] Generate order summary
- [ ] Handle confirmation ("yes"/"no" responses)
- [ ] Implement Zapier webhook call on confirmation
- [ ] Test full ordering flow end-to-end

**Deliverable:** Complete order flow works: order → confirm → log to Google Sheets

---

## Milestone 9: Error Handling & Edge Cases
**Estimated Time: 1-2 hours**

### Tasks:
- [ ] Handle WebSocket disconnections gracefully
- [ ] Implement reconnection logic
- [ ] Handle OpenAI API errors
- [ ] Handle Twilio stream errors
- [ ] Add timeout handling
- [ ] Logging and debugging tools
- [ ] Error messages for edge cases

**Deliverable:** System handles errors gracefully, doesn't crash

---

## Milestone 10: Testing & Optimization
**Estimated Time: 2-3 hours**

### Tasks:
- [ ] Test various conversation flows
- [ ] Test with different menu items and variations
- [ ] Measure and optimize latency
- [ ] Test interruption handling
- [ ] Load testing (if applicable)
- [ ] Cost optimization review
- [ ] Documentation and code cleanup

**Deliverable:** Production-ready system, fully tested

---

## Timeline Summary

| Phase | Time | Cumulative |
|-------|------|------------|
| Setup & Infrastructure | 2-3 hrs | 2-3 hrs |
| Phone Number & Webhook | 1-2 hrs | 3-5 hrs |
| TwiML Media Stream | 2-3 hrs | 5-8 hrs |
| OpenAI Connection | 2-3 hrs | 7-11 hrs |
| Audio Bridge | 3-4 hrs | 10-15 hrs |
| AI Conversation | 2-3 hrs | 12-18 hrs |
| Barge-in | 1-2 hrs | 13-20 hrs |
| Order Management | 2-3 hrs | 15-23 hrs |
| Error Handling | 1-2 hrs | 16-25 hrs |
| Testing | 2-3 hrs | 18-28 hrs |

**Conservative Estimate: 18-28 hours** (accounting for debugging and unexpected issues)

**Optimistic Estimate: 12-18 hours** (if everything goes smoothly)

---

## Quick Start Option (Using Existing Templates)

**Time Saved: 8-12 hours**

Instead of building from scratch, you can:

1. **Use Twilio's Official Template** (2-4 hours to customize)
   - Clone: `twilio-samples/speech-assistant-openai-realtime-api-node`
   - Adjust prompts for pizza ordering
   - Add menu context
   - Connect Zapier webhook

2. **Use Twilio Labs Call-GPT** (3-5 hours to customize)
   - Clone: `twilio-labs/call-gpt`
   - Uses Deepgram (cheaper) instead of OpenAI Realtime
   - Requires more integration work

**Recommended:** Start with the official Twilio template to save time.

---

## Resources & References

- **Twilio Code Exchange:** [Real-time AI Voice Assistant with OpenAI Realtime API](https://www.twilio.com/code-exchange/ai-voice-assistant-openai-realtime-api)
- **GitHub (Node.js):** `twilio-samples/speech-assistant-openai-realtime-api-node`
- **GitHub (Python):** `twilio-samples/speech-assistant-openai-realtime-api-python`
- **Blog Tutorial:** [AI Voice Assistant with Twilio Voice, OpenAI's Realtime API, and Python](https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-python)
- **Twilio Media Streams Docs:** [WebSocket Messages](https://www.twilio.com/docs/voice/media-streams/websocket-messages)

---

## Cost Considerations

**Per Call Costs:**
- **Twilio:** ~$0.013-0.015 per minute (voice calls)
- **OpenAI Realtime:** ~$0.20-0.25 per minute (audio processing)
- **Total:** ~$0.21-0.27 per minute ≈ **$12-16 per hour** of calls

**Alternative (Cheaper):**
- Use Deepgram STT (~$0.01/min) + GPT-3.5 (~$0.01/min) + TTS (~$0.02/min)
- **Total:** ~$0.04 per minute ≈ **$2.40 per hour** of calls
- Trade-off: Slightly higher latency, more integration work

---

## Notes

- **Current Architecture:** You're using Twilio Studio + Functions (simpler, but not real-time streaming)
- **Proposed Architecture:** Media Streams + WebSockets (real-time, lower latency, more complex)
- **Migration Path:** You'd need to replace your Studio flow entirely with this server-based approach
- **Recommendation:** If latency isn't critical, your current Studio setup might be sufficient. Only migrate if you need true real-time streaming.





