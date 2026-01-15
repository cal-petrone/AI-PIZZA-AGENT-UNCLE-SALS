/**
 * OpenAI Realtime API Service
 * Handles WebSocket connection to OpenAI Realtime API
 */

const WebSocket = require('ws');
const { getMenuText } = require('../config/menu');

class OpenAIService {
  constructor(apiKey, orderManager, onAudioCallback, onTranscriptCallback) {
    this.apiKey = apiKey;
    this.orderManager = orderManager;
    this.onAudioCallback = onAudioCallback; // Callback to send audio to Twilio
    this.onTranscriptCallback = onTranscriptCallback; // Callback for transcripts
    this.client = null;
    this.ready = false;
    this.sessionId = null;
  }
  
  /**
   * Connect to OpenAI Realtime API
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
        
        this.client = new WebSocket(url, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        });
        
        this.client.on('open', () => {
          console.log('✓ OpenAI WebSocket connected');
          this._setupSession();
          resolve();
        });
        
        this.client.on('message', (data) => {
          this._handleMessage(data);
        });
        
        this.client.on('error', (error) => {
          console.error('✗ OpenAI WebSocket error:', error);
          this.ready = false;
          reject(error);
        });
        
        this.client.on('close', (code, reason) => {
          console.log(`OpenAI connection closed: ${code} ${reason?.toString()}`);
          this.ready = false;
          // Remove all listeners to prevent memory leaks
          if (this.client) {
            this.client.removeAllListeners();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Setup OpenAI session with configuration
   */
  _setupSession() {
    const menuText = getMenuText();
    const orderSummary = this.orderManager.getSummary();
    
    const instructions = `You are a friendly pizza ordering assistant for Uncle Sal's Pizza. You help customers place orders over the phone.

AVAILABLE MENU ITEMS:
${menuText}

CURRENT ORDER STATE:
Items: ${orderSummary}
Delivery Method: ${this.orderManager.getOrder().deliveryMethod || 'not specified'}
Address: ${this.orderManager.getOrder().address || 'not specified'}
Customer Name: ${this.orderManager.getOrder().customerName || 'not provided'}
Payment Method: ${this.orderManager.getOrder().paymentMethod || 'not specified'}

CONVERSATION RULES:
1. Start by greeting: "Thanks for calling Uncle Sal's Pizza! What would you like to order today?"
2. When customer mentions items, use the add_item_to_order tool immediately
3. Ask follow-up questions naturally (size, quantity, etc.)
4. Periodically summarize the order: "So far you have [items]. What else can I get you?"
5. When customer says they're done ("that's it", "I'm all set", etc.), ask about pickup or delivery
6. If delivery, ask for address and repeat it back for confirmation
7. Before finalizing, read back the complete order with totals
8. Ask for customer name at the end (REQUIRED)
9. Only confirm order after customer explicitly confirms ("yes", "that's correct", etc.)
10. Be conversational and friendly, not robotic
11. Use tools immediately when customer mentions items - don't wait
12. Vary your responses - don't repeat the same question

IMPORTANT: Finish complete sentences. Don't cut off mid-sentence.`;

    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: instructions,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        tools: [
          {
            type: 'function',
            name: 'add_item_to_order',
            description: 'Add an item to the customer\'s order',
            parameters: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'The menu item name (must match menu exactly)'
                },
                size: {
                  type: 'string',
                  description: 'Size of the item (small, medium, large, regular)',
                  enum: ['small', 'medium', 'large', 'regular']
                },
                quantity: {
                  type: 'number',
                  description: 'Quantity of the item',
                  minimum: 1,
                  default: 1
                }
              },
              required: ['name']
            }
          },
          {
            type: 'function',
            name: 'set_delivery_method',
            description: 'Set whether order is for pickup or delivery',
            parameters: {
              type: 'object',
              properties: {
                method: {
                  type: 'string',
                  enum: ['pickup', 'delivery'],
                  description: 'Pickup or delivery'
                }
              },
              required: ['method']
            }
          },
          {
            type: 'function',
            name: 'set_address',
            description: 'Set delivery address',
            parameters: {
              type: 'object',
              properties: {
                address: {
                  type: 'string',
                  description: 'Full delivery address'
                }
              },
              required: ['address']
            }
          },
          {
            type: 'function',
            name: 'set_customer_name',
            description: 'Set customer name',
            parameters: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Customer name'
                }
              },
              required: ['name']
            }
          },
          {
            type: 'function',
            name: 'set_customer_phone',
            description: 'Set customer phone number',
            parameters: {
              type: 'object',
              properties: {
                phone: {
                  type: 'string',
                  description: 'Customer phone number'
                }
              },
              required: ['phone']
            }
          },
          {
            type: 'function',
            name: 'set_payment_method',
            description: 'Set payment method',
            parameters: {
              type: 'object',
              properties: {
                method: {
                  type: 'string',
                  enum: ['cash', 'card'],
                  description: 'Payment method'
                }
              },
              required: ['method']
            }
          },
          {
            type: 'function',
            name: 'confirm_order',
            description: 'Confirm the order is complete and ready to be logged',
            parameters: {
              type: 'object',
              properties: {}
            }
          }
        ],
        tool_choice: 'auto',
        temperature: 0.8,
        max_response_output_tokens: 256
      }
    };
    
    this.client.send(JSON.stringify(sessionUpdate));
    console.log('✓ OpenAI session configured');
  }
  
  /**
   * Handle messages from OpenAI
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'session.created':
          this.sessionId = message.session.id;
          this.ready = true;
          console.log('✓ OpenAI session created:', this.sessionId);
          break;
          
        case 'session.updated':
          this.ready = true;
          console.log('✓ OpenAI session updated');
          break;
          
        case 'response.audio_transcript.delta':
          // AI is speaking - send audio to Twilio
          if (message.delta && this.onAudioCallback) {
            this.onAudioCallback(message.delta);
          }
          break;
          
        case 'response.audio_transcript.done':
          console.log('✓ AI response complete');
          break;
          
        case 'conversation.item.input_audio_transcription.completed':
          // User speech transcribed
          if (message.transcript && this.onTranscriptCallback) {
            this.onTranscriptCallback(message.transcript);
          }
          break;
          
        case 'response.audio_transcript.done':
        case 'response.done':
          console.log('✓ Response completed');
          break;
          
        case 'response.function_call_arguments.done':
          // Tool call completed - process it
          this._handleToolCall(message);
          break;
          
        case 'error':
          console.error('OpenAI error:', message.error);
          break;
          
        default:
          // Ignore other message types
          break;
      }
    } catch (error) {
      // Message might be binary audio, not JSON
      // This is expected for audio data
    }
  }
  
  /**
   * Handle tool calls from OpenAI
   */
  _handleToolCall(message) {
    try {
      const callId = message.call_id;
      const functionName = message.name;
      const argumentsStr = message.arguments || '{}';
      const args = JSON.parse(argumentsStr);
      
      console.log(`🔧 Tool call: ${functionName}`, args);
      
      switch (functionName) {
        case 'add_item_to_order':
          this.orderManager.addItem(
            args.name,
            args.size || 'regular',
            args.quantity || 1
          );
          console.log(`✓ Added to order: ${args.quantity || 1}x ${args.size || 'regular'} ${args.name}`);
          break;
          
        case 'set_delivery_method':
          this.orderManager.setDeliveryMethod(args.method);
          console.log(`✓ Delivery method set: ${args.method}`);
          break;
          
        case 'set_address':
          this.orderManager.setAddress(args.address);
          console.log(`✓ Address set: ${args.address}`);
          break;
          
        case 'set_customer_name':
          this.orderManager.setCustomerName(args.name);
          console.log(`✓ Customer name set: ${args.name}`);
          break;
          
        case 'set_customer_phone':
          this.orderManager.setCustomerPhone(args.phone);
          console.log(`✓ Customer phone set: ${args.phone}`);
          break;
          
        case 'set_payment_method':
          this.orderManager.setPaymentMethod(args.method);
          console.log(`✓ Payment method set: ${args.method}`);
          break;
          
        case 'confirm_order':
          this.orderManager.confirm();
          console.log('✓ Order confirmed');
          break;
      }
      
      // Send tool result back to OpenAI
      this.client.send(JSON.stringify({
        type: 'response.function_call_arguments.done',
        call_id: callId
      }));
    } catch (error) {
      console.error('Error handling tool call:', error);
    }
  }
  
  /**
   * Send audio input to OpenAI
   */
  sendAudio(audioBase64) {
    if (!this.ready || !this.client || this.client.readyState !== WebSocket.OPEN) {
      return false;
    }
    
    try {
      this.client.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: audioBase64
      }));
      return true;
    } catch (error) {
      console.error('Error sending audio to OpenAI:', error);
      return false;
    }
  }
  
  /**
   * Send text input to OpenAI (for testing or fallback)
   */
  sendText(text) {
    if (!this.ready || !this.client || this.client.readyState !== WebSocket.OPEN) {
      return false;
    }
    
    try {
      this.client.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: text
        }
      }));
      return true;
    } catch (error) {
      console.error('Error sending text to OpenAI:', error);
      return false;
    }
  }
  
  /**
   * Close connection
   */
  close() {
    if (this.client) {
      this.client.removeAllListeners();
      if (this.client.readyState === WebSocket.OPEN || this.client.readyState === WebSocket.CONNECTING) {
        this.client.close();
      }
      this.client = null;
    }
    this.ready = false;
  }
  
  /**
   * Check if connection is ready
   */
  isReady() {
    return this.ready && this.client && this.client.readyState === WebSocket.OPEN;
  }
}

module.exports = OpenAIService;





