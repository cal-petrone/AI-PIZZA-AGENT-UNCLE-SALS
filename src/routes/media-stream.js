/**
 * Media Stream Route
 * Handles WebSocket connection from Twilio Media Streams
 */

const WebSocket = require('ws');
const OrderManager = require('../services/order-manager');
const OpenAIService = require('../services/openai-service');
const Logger = require('../services/logger');

function setupMediaStream(wss, logger) {
  wss.on('connection', (ws, req) => {
    console.log('📡 Twilio Media Stream WebSocket connection received');
    
    let streamSid = null;
    let callSid = null;
    let fromNumber = null;
    let orderManager = null;
    let openaiService = null;
    let audioBuffer = [];
    let audioBufferTimer = null;
    
    // Extract stream identifier from URL query params
    const url = new URL(req.url, `http://${req.headers.host}`);
    const streamName = url.searchParams.get('name') || url.pathname.split('/').pop();
    callSid = streamName; // Use as callSid
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.event) {
          case 'start':
            // Stream started
            streamSid = message.start.streamSid;
            callSid = message.start.callSid || callSid;
            fromNumber = message.start.customParameters?.from || message.start.from || 'unknown';
            
            console.log(`✓ Stream started: ${streamSid} (CallSid: ${callSid}, From: ${fromNumber})`);
            
            // Initialize order manager
            orderManager = new OrderManager(streamSid, callSid, fromNumber);
            
            // Initialize OpenAI service
            openaiService = new OpenAIService(
              process.env.OPENAI_API_KEY,
              orderManager,
              // onAudioCallback - send audio to Twilio
              (audioBase64) => {
                if (ws.readyState === WebSocket.OPEN) {
                  // Convert base64 audio to format Twilio expects
                  // Twilio expects mu-law PCM audio in base64
                  // OpenAI sends PCM16, we need to convert or send as-is
                  ws.send(JSON.stringify({
                    event: 'media',
                    streamSid: streamSid,
                    media: {
                      payload: audioBase64
                    }
                  }));
                }
              },
              // onTranscriptCallback - handle user speech
              (transcript) => {
                console.log(`👤 User said: ${transcript}`);
              }
            );
            
            // Connect to OpenAI
            openaiService.connect().catch(error => {
              console.error('Error connecting to OpenAI:', error);
            });
            
            break;
            
          case 'media':
            // Audio data from Twilio
            if (message.media && message.media.payload) {
              const audioPayload = message.media.payload;
              
              // Buffer audio and send in chunks to OpenAI
              audioBuffer.push(audioPayload);
              
              // Send buffered audio every 100ms
              if (!audioBufferTimer) {
                audioBufferTimer = setInterval(() => {
                  if (audioBuffer.length > 0 && openaiService && openaiService.isReady()) {
                    const combinedAudio = audioBuffer.join('');
                    openaiService.sendAudio(combinedAudio);
                    audioBuffer = [];
                  }
                }, 100);
              }
            }
            break;
            
          case 'stop':
            // Stream stopped
            console.log(`Stream stopped: ${streamSid}`);
            
            // Clean up
            if (audioBufferTimer) {
              clearTimeout(audioBufferTimer);
              audioBufferTimer = null;
            }
            
            // Send any remaining buffered audio
            if (audioBuffer.length > 0 && openaiService && openaiService.isReady()) {
              const combinedAudio = audioBuffer.join('');
              openaiService.sendAudio(combinedAudio);
              audioBuffer = [];
            }
            
            // Close OpenAI connection
            if (openaiService) {
              openaiService.close();
            }
            
            // Log order if ready
            if (orderManager && orderManager.isReadyToLog()) {
              const orderData = orderManager.getOrderForLogging();
              logger.logOrder(orderData).then(result => {
                if (result.success) {
                  orderManager.markAsLogged();
                  console.log('✓ Order logged successfully');
                } else {
                  console.error('✗ Failed to log order after retries');
                }
              }).catch(error => {
                console.error('Error logging order:', error);
              });
            }
            
            break;
        }
      } catch (error) {
        // Message might be binary or malformed
        console.error('Error processing Twilio message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Twilio WebSocket closed - cleaning up...');
      
      // Clear audio buffer timer
      if (audioBufferTimer) {
        clearTimeout(audioBufferTimer);
        audioBufferTimer = null;
      }
      
      // Close OpenAI connection
      if (openaiService) {
        openaiService.close();
      }
      
      // Log order if ready (fallback)
      if (orderManager && orderManager.isReadyToLog() && !orderManager.getOrder().logged) {
        const orderData = orderManager.getOrderForLogging();
        logger.logOrder(orderData).then(result => {
          if (result.success) {
            orderManager.markAsLogged();
            console.log('✓ Order logged successfully (on close)');
          }
        }).catch(error => {
          console.error('Error logging order on close:', error);
        });
      }
      
      console.log('✓ Cleanup complete');
    });
    
    ws.on('error', (error) => {
      console.error('Twilio WebSocket error:', error);
    });
  });
}

module.exports = setupMediaStream;





