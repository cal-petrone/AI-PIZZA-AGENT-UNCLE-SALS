/**
 * Incoming Call Route
 * Handles Twilio webhook for incoming calls
 * Returns TwiML to start Media Stream
 */

const twilio = require('twilio');

function handleIncomingCall(req, res) {
  try {
    const calledNumber = req.body.Called || req.body.To;
    const callSid = req.body.CallSid;
    const fromNumber = req.body.From;
    
    console.log(`📞 Incoming call: ${fromNumber} -> ${calledNumber} (CallSid: ${callSid})`);
    
    // Get base URL for WebSocket endpoint
    const protocol = req.protocol || 'https';
    const host = req.get('host') || process.env.NGROK_URL?.replace(/^https?:\/\//, '') || 'localhost:3000';
    const wsUrl = `${protocol}://${host}/media-stream`;
    
    // Create TwiML response
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Connect to Media Stream
    const connect = twiml.connect();
    const stream = connect.stream({
      url: wsUrl,
      name: callSid // Use CallSid as stream identifier
    });
    
    console.log(`✓ TwiML generated, connecting to: ${wsUrl}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error handling incoming call:', error);
    res.status(500).send('Error processing call');
  }
}

module.exports = handleIncomingCall;





