/**
 * Uncle Sal's Pizza AI Receptionist - Twilio Function with OpenAI Integration
 * 
 * EXPECTED JSON INPUT from Twilio Studio (POST):
 * {
 *   "speech": "string - caller's speech from Gather widget",
 *   "from": "string - caller phone number",
 *   "callSid": "string - unique call identifier",
 *   "order": object | JSON string | null - existing order state
 * }
 * 
 * JSON OUTPUT to Twilio Studio:
 * {
 *   "say": "string - text for Studio to speak to caller",
 *   "order": object - updated order state (for Studio Set Variables),
 *   "shouldLog": boolean - true when order is confirmed and ready for Zapier
 * }
 * 
 * Studio Usage:
 * - Set Variables: order = {{widgets.http_1.parsed.order}} (Parse as JSON Object)
 * - Say: {{widgets.http_1.parsed.say}}
 * - Split based on shouldLog to trigger Zapier webhook
 * 
 * ENVIRONMENT VARIABLE REQUIRED:
 * - OPENAI_API_KEY: Your OpenAI API key (set in Twilio Function configuration)
 */

const https = require('https');

exports.handler = function(context, event, callback) {
  // Wrap everything in try-catch for ultimate safety
  try {
    return processOrder(context, event, callback);
  } catch (error) {
    console.error('Unexpected error:', error);
    const safeResponse = {
      say: "I'm sorry, I encountered an issue. Please call back and we'll help you place your order.",
      order: { items: [], confirmed: false },
      shouldLog: false
    };
    return callback(null, safeResponse);
  }
};

function processOrder(context, event, callback) {
  // Extract speech from various possible field names
  let speech = '';
  
  if (event.speech) {
    speech = event.speech;
  } else if (event.SpeechResult) {
    speech = event.SpeechResult;
  } else if (event.widgets && event.widgets.gather_1 && event.widgets.gather_1.SpeechResult) {
    speech = event.widgets.gather_1.SpeechResult;
  } else {
    // Try to find any field that might contain speech
    for (const key in event) {
      if (key.toLowerCase().includes('speech') || key.toLowerCase().includes('result')) {
        const value = event[key];
        if (typeof value === 'string' && value.trim().length > 0) {
          speech = value;
          break;
        }
      }
    }
  }
  
  speech = speech.toString().trim();
  const from = (event.from || '').toString();
  const callSid = (event.callSid || '').toString();
  
  console.log('Received speech:', speech);
  
  // Parse order state
  let order = parseOrderState(event.order);
  
  // Initialize order structure
  if (!order.items || !Array.isArray(order.items)) {
    order.items = [];
  }
  if (typeof order.confirmed !== 'boolean') {
    order.confirmed = false;
  }
  if (!order.pendingQuestion) {
    order.pendingQuestion = null;
  }
  
  // Menu configuration - AI will use this to match user requests
  const menu = {
    // Pizzas
    'cheese pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 12.99, medium: 15.99, large: 18.99 }
    },
    'pepperoni pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 14.99, medium: 17.99, large: 20.99 }
    },
    'margherita pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 15.99, medium: 18.99, large: 21.99 }
    },
    'white pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 14.99, medium: 17.99, large: 20.99 }
    },
    'supreme pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 17.99, medium: 20.99, large: 23.99 }
    },
    'veggie pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 16.99, medium: 19.99, large: 22.99 }
    },
    // Calzones
    'calzone': {
      sizes: ['regular'],
      priceMap: { regular: 12.99 }
    },
    'pepperoni calzone': {
      sizes: ['regular'],
      priceMap: { regular: 14.99 }
    },
    // Sides
    'garlic bread': {
      sizes: ['regular'],
      priceMap: { regular: 5.99 }
    },
    'garlic knots': {
      sizes: ['regular'],
      priceMap: { regular: 6.99 }
    },
    'mozzarella sticks': {
      sizes: ['regular'],
      priceMap: { regular: 7.99 }
    },
    'french fries': {
      sizes: ['regular', 'large'],
      priceMap: { regular: 4.99, large: 6.99 }
    },
    'salad': {
      sizes: ['small', 'large'],
      priceMap: { small: 6.99, large: 9.99 }
    },
    // Drinks
    'soda': {
      sizes: ['regular'],
      priceMap: { regular: 2.99 }
    },
    'water': {
      sizes: ['regular'],
      priceMap: { regular: 1.99 }
    }
  };
  
  // Handle empty speech
  if (!speech || speech.length === 0) {
    const fallbackResponse = {
      say: order.items.length === 0 
        ? "I didn't catch that. What would you like to order?" 
        : "I didn't hear that. Could you repeat?",
      order: order,
      shouldLog: false
    };
    return callback(null, fallbackResponse);
  }
  
  // Get OpenAI API key from environment
  const openaiApiKey = context.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    console.error('OPENAI_API_KEY not found in environment variables');
    return callback(null, {
      say: "I'm having trouble connecting right now. Please try again in a moment.",
      order: order,
      shouldLog: false
    });
  }
  
  // Call OpenAI to understand the speech and generate response
  callOpenAI(openaiApiKey, speech, order, menu)
    .then(aiResult => {
      // Update order based on AI's extraction
      const updatedOrder = updateOrderFromAI(order, aiResult, menu);
      
      // If no items were added and we have items in the extracted data, the AI might have failed to match
      // In this case, try to provide a helpful response
      if (aiResult.extractedData && aiResult.extractedData.items && 
          aiResult.extractedData.items.length > 0 && updatedOrder.items.length === order.items.length) {
        // Items were mentioned but not added - might be a matching issue
        const mentionedItems = aiResult.extractedData.items.map(i => i.name).join(', ');
        console.warn(`Items mentioned but not matched: ${mentionedItems}`);
      }
      
      // Determine shouldLog based on AI result and order state
      let shouldLog = aiResult.shouldLog || false;
      if (updatedOrder.confirmed && updatedOrder.items.length > 0) {
        // Double-check all required info is present before logging
        const hasDeliveryMethod = !!updatedOrder.deliveryMethod;
        const hasAddress = updatedOrder.deliveryMethod !== 'delivery' || !!updatedOrder.address;
        const hasPayment = !!updatedOrder.paymentMethod;
        
        if (hasDeliveryMethod && hasAddress && hasPayment) {
          shouldLog = true;
        }
      }
      
      return callback(null, {
        say: aiResult.response || "Got it! Anything else?",
        order: updatedOrder,
        shouldLog: shouldLog
      });
    })
    .catch(error => {
      console.error('OpenAI API error:', error);
      console.error('Error details:', error.message);
      // Fallback to simple keyword-based response if AI fails
      return callback(null, getFallbackResponse(speech, order, menu));
    });
}

/**
 * Call OpenAI API to understand speech and generate conversational response
 */
function callOpenAI(apiKey, speech, order, menu) {
  return new Promise((resolve, reject) => {
    // Build system prompt with menu and context
    const systemPrompt = buildSystemPrompt(menu, order);
    
    // Build user message with current speech
    const userMessage = `Customer said: "${speech}"`;
    
    const requestData = JSON.stringify({
      model: "gpt-4o-mini", // Using gpt-4o-mini for cost efficiency, can change to "gpt-4" for better quality
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      temperature: 0.7, // Makes responses more natural and conversational
      max_tokens: 300
    });
    
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (res.statusCode !== 200) {
            console.error('OpenAI API error:', response);
            reject(new Error(`OpenAI API returned status ${res.statusCode}: ${response.error?.message || 'Unknown error'}`));
            return;
          }
          
          const content = response.choices[0].message.content.trim();
          
          console.log('OpenAI raw response:', content);
          
          // Parse the AI response - it should return JSON
          let aiResult;
          try {
            // Try to extract JSON from the response - handle both single and multi-line
            // Look for JSON object boundaries more carefully
            let jsonMatch = content.match(/\{[\s\S]*\}/);
            
            // If first attempt fails, try removing markdown code blocks
            if (!jsonMatch && content.includes('```')) {
              const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
              if (codeBlockMatch) {
                jsonMatch = codeBlockMatch;
              }
            }
            
            if (jsonMatch) {
              const jsonStr = jsonMatch[0];
              aiResult = JSON.parse(jsonStr);
              
              // Validate required fields
              if (!aiResult.response) {
                console.warn('AI response missing "response" field, using full content');
                aiResult.response = content;
              }
              if (!aiResult.extractedData) {
                aiResult.extractedData = {};
              }
              if (typeof aiResult.shouldLog !== 'boolean') {
                aiResult.shouldLog = false;
              }
              
              console.log('Parsed AI result:', JSON.stringify(aiResult, null, 2));
            } else {
              // If no JSON found, try to extract meaning from text response
              console.warn('No JSON found in AI response, attempting to extract from text');
              aiResult = {
                response: content,
                extractedData: {},
                shouldLog: false
              };
            }
          } catch (parseError) {
            console.error('JSON parse error:', parseError.message);
            console.error('Content that failed to parse:', content);
            // If JSON parsing fails, use the text as response and try to extract intent
            aiResult = {
              response: content,
              extractedData: extractIntentFromText(content, order),
              shouldLog: false
            };
          }
          
          resolve(aiResult);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(requestData);
    req.end();
  });
}

/**
 * Build system prompt for OpenAI with menu, order state, and instructions
 */
function buildSystemPrompt(menu, order) {
  // Format menu as readable list
  const menuList = Object.keys(menu).map(itemName => {
    const item = menu[itemName];
    const sizes = item.sizes.join(', ');
    return `- ${itemName} (sizes: ${sizes})`;
  }).join('\n');
  
  // Current order summary
  let orderSummary = 'No items in order yet.';
  if (order.items && order.items.length > 0) {
    orderSummary = order.items.map(item => {
      const qty = item.quantity || 1;
      const size = item.size || '';
      return `${qty}x ${size} ${item.name}`;
    }).join(', ');
  }
  
  const deliveryMethod = order.deliveryMethod || 'not specified';
  const address = order.address || 'not provided';
  const paymentMethod = order.paymentMethod || 'not specified';
  
  return `You are a friendly pizza ordering assistant for Uncle Sal's Pizza. You help customers place orders over the phone.

AVAILABLE MENU ITEMS:
${menuList}

CURRENT ORDER STATE:
Items: ${orderSummary}
Delivery Method: ${deliveryMethod}
Address: ${address}
Payment Method: ${paymentMethod}
Pending Question: ${order.pendingQuestion || 'none'}

INSTRUCTIONS:
1. Understand what the customer is saying naturally - they might say "fries" (meaning french fries), "pop" or "soda" (same thing), "large pepperoni" (meaning large pepperoni pizza), "garlic knots", etc.
2. Extract ANY items mentioned - if customer says multiple items in one sentence, extract ALL of them (e.g., "large pepperoni pizza and garlic knots" = extract both items)
3. Match items to the menu - use EXACT menu item names from the list above (e.g., "garlic knots" not "garl" or "garlic knot")
4. Generate a friendly, conversational response (like a real person, not a robot)
5. If they add item(s), confirm them naturally like "Got it! A large pepperoni pizza and garlic knots. What else can I get you?" or "Sure! Added those to your order. Anything else?"
6. Common completion phrases that mean they're done ordering: "I'm all set", "that's it", "that's all", "that'll be it", "I'm done", "nothing else", "that's everything"
7. When they indicate they're done (using phrases above), ask about pickup/delivery if not already known
8. Don't ask pickup/delivery immediately after adding items - only when they say they're done
9. Use the NYS sales tax rate of 8% for calculations
10. When order is complete and customer confirms (says "yes" after seeing summary), set "shouldLog": true
11. If customer wants to add more items, extract them and set "isDone": false
12. Always return valid JSON - if you're unsure about an item, try your best to match it to the menu

IMPORTANT - Return ONLY valid JSON in this exact format:
{
  "response": "Your conversational response to speak to the customer",
  "extractedData": {
    "items": [{"name": "pepperoni pizza", "size": "large", "quantity": 1}],
    "deliveryMethod": "pickup" or "delivery" or null,
    "address": "address string" or null,
    "paymentMethod": "cash" or "card" or null,
    "isDone": true or false,
    "isConfirmed": true or false
  },
  "shouldLog": true or false,
  "pendingQuestion": "deliveryMethod" or "address" or "paymentMethod" or null
}

Be conversational and helpful, not robotic!`;
}

/**
 * Extract intent from text response when JSON parsing fails
 */
function extractIntentFromText(text, currentOrder) {
  const textLower = text.toLowerCase();
  const extracted = {
    items: [],
    isDone: false,
    isConfirmed: false
  };
  
  // Check for completion phrases
  if (textLower.includes("i'm all set") || textLower.includes("that's it") || 
      textLower.includes("that's all") || textLower.includes("that'll be it") ||
      textLower.includes("i'm done") || textLower.includes("nothing else")) {
    extracted.isDone = true;
  }
  
  // Check for confirmation
  if (textLower.includes("yes") || textLower.includes("correct") || textLower.includes("right")) {
    extracted.isConfirmed = true;
  }
  
  return extracted;
}

/**
 * Update order state based on AI's extracted data
 */
function updateOrderFromAI(currentOrder, aiResult, menu) {
  const order = JSON.parse(JSON.stringify(currentOrder)); // Deep copy
  const extracted = aiResult.extractedData || {};
  
  // Add new items
  if (extracted.items && Array.isArray(extracted.items) && extracted.items.length > 0) {
    extracted.items.forEach(newItem => {
      // Validate item exists in menu - try fuzzy matching if exact match fails
      let menuItemName = newItem.name;
      
      // First try exact match
      if (!menu[menuItemName]) {
        // Try case-insensitive match
        const lowerName = menuItemName.toLowerCase();
        for (const menuItem in menu) {
          if (menuItem.toLowerCase() === lowerName) {
            menuItemName = menuItem;
            break;
          }
        }
      }
      
      // If still not found, try partial matching
      if (!menu[menuItemName]) {
        const words = menuItemName.toLowerCase().split(/\s+/);
        for (const menuItem in menu) {
          const menuWords = menuItem.toLowerCase().split(/\s+/);
          // Check if all words in item name are in menu item
          if (words.every(word => menuWords.some(mw => mw.includes(word) || word.includes(mw)))) {
            menuItemName = menuItem;
            console.log(`Fuzzy matched "${newItem.name}" to "${menuItemName}"`);
            break;
          }
        }
      }
      
      // Only add if we found a valid menu item
      if (menu[menuItemName]) {
        // Set default size if not provided
        let size = newItem.size;
        if (!size && menu[menuItemName].sizes.length > 0) {
          size = menu[menuItemName].sizes[0];
        }
        
        // Set default quantity
        const quantity = newItem.quantity || 1;
        
        // Get price
        const price = menu[menuItemName].priceMap[size] || 0;
        
        order.items.push({
          name: menuItemName,
          size: size,
          quantity: quantity,
          price: price
        });
        
        console.log(`Added item: ${quantity}x ${size} ${menuItemName}`);
      } else {
        console.warn(`Item not found in menu: "${newItem.name}"`);
      }
    });
  }
  
  // Update delivery method
  if (extracted.deliveryMethod) {
    order.deliveryMethod = extracted.deliveryMethod;
  }
  
  // Update address
  if (extracted.address) {
    order.address = extracted.address;
  }
  
  // Update payment method
  if (extracted.paymentMethod) {
    order.paymentMethod = extracted.paymentMethod;
  }
  
  // Update pending question
  if (aiResult.pendingQuestion !== undefined) {
    order.pendingQuestion = aiResult.pendingQuestion;
  }
  
  // Handle confirmation
  if (extracted.isConfirmed) {
    order.confirmed = true;
  } else if (extracted.isDone && !extracted.isConfirmed) {
    order.confirmed = false;
  }
  
  return order;
}

/**
 * Fallback response if OpenAI fails
 */
function getFallbackResponse(speech, order, menu) {
  const speechLower = speech.toLowerCase();
  
  // Very basic fallback for common completion phrases
  const completionPhrases = [
    'done', "that's all", 'finished', "i'm all set", "that's it", 
    "that'll be it", "i'm done", "nothing else", "that's everything"
  ];
  
  const isCompletionPhrase = completionPhrases.some(phrase => speechLower.includes(phrase));
  
  if (isCompletionPhrase) {
    if (order.items.length === 0) {
      return {
        say: "You haven't added any items yet. What would you like to order?",
        order: order,
        shouldLog: false
      };
    }
    
    const nextQuestion = getNextRequiredQuestion(order);
    if (nextQuestion) {
      order.pendingQuestion = nextQuestion.includes('pickup') ? 'deliveryMethod' : 
                             nextQuestion.includes('address') ? 'address' : 
                             nextQuestion.includes('cash') ? 'paymentMethod' : null;
      return {
        say: nextQuestion,
        order: order,
        shouldLog: false
      };
    }
    
    // Generate summary
    const totals = calculateTotals(order, menu);
    const summary = generateOrderSummary(order, menu, totals);
    order.confirmed = true;
    return {
      say: summary + " Is that correct?",
      order: order,
      shouldLog: false
    };
  }
  
  return {
    say: "I'm having trouble understanding right now. Could you try saying that again?",
    order: order,
    shouldLog: false
  };
}

/**
 * Parse order state from various formats (string, object, null, undefined)
 */
function parseOrderState(orderInput) {
  if (orderInput === undefined || orderInput === null || orderInput === 'undefined' || orderInput === 'null') {
    return { items: [], confirmed: false, pendingQuestion: null };
  }
  
  if (typeof orderInput === 'string') {
    const trimmed = orderInput.trim();
    if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') {
      return { items: [], confirmed: false, pendingQuestion: null };
    }
    
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
      return { items: [], confirmed: false, pendingQuestion: null };
    } catch (e) {
      console.log('Failed to parse order as JSON:', e.message);
      return { items: [], confirmed: false, pendingQuestion: null };
    }
  }
  
  if (typeof orderInput === 'object') {
    try {
      return JSON.parse(JSON.stringify(orderInput));
    } catch (e) {
      console.log('Failed to clone order object:', e.message);
      return { items: [], confirmed: false, pendingQuestion: null };
    }
  }
  
  return { items: [], confirmed: false, pendingQuestion: null };
}

/**
 * Get the next required question based on current order state
 */
function getNextRequiredQuestion(order) {
  if (!order.deliveryMethod) {
    return "Is this for pickup or delivery?";
  }
  
  if (order.deliveryMethod === 'delivery' && !order.address) {
    return "What's your delivery address?";
  }
  
  if (!order.paymentMethod) {
    return "Will you be paying with cash or card?";
  }
  
  return null;
}

/**
 * Calculate order totals with 8% NYS sales tax
 */
function calculateTotals(order, menu) {
  let subtotal = 0;
  
  if (order.items && Array.isArray(order.items)) {
    order.items.forEach(item => {
      if (menu[item.name] && menu[item.name].priceMap[item.size]) {
        item.price = menu[item.name].priceMap[item.size];
      }
      const itemTotal = (item.price || 0) * (item.quantity || 1);
      subtotal += itemTotal;
    });
  }
  
  const taxRate = 0.08; // 8% NYS sales tax
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100
  };
}

/**
 * Generate order summary for confirmation
 */
function generateOrderSummary(order, menu, totals) {
  let summary = "Here's your order. ";
  
  if (order.items && order.items.length > 0) {
    summary += "You have ";
    order.items.forEach((item, index) => {
      const qty = item.quantity || 1;
      const size = item.size || '';
      const itemDesc = qty > 1 ? `${qty} ${size} ${item.name}s` : `1 ${size} ${item.name}`;
      
      if (index === 0) {
        summary += itemDesc;
      } else if (index === order.items.length - 1) {
        summary += ` and ${itemDesc}`;
      } else {
        summary += `, ${itemDesc}`;
      }
    });
    summary += ". ";
  }
  
  summary += `Subtotal is $${totals.subtotal.toFixed(2)}, `;
  summary += `tax is $${totals.tax.toFixed(2)}, `;
  summary += `for a total of $${totals.total.toFixed(2)}. `;
  
  if (order.deliveryMethod === 'pickup') {
    summary += "This is for pickup. ";
  } else if (order.deliveryMethod === 'delivery') {
    summary += `This is for delivery to ${order.address || 'your address'}. `;
  }
  
  if (order.paymentMethod) {
    summary += `Payment will be by ${order.paymentMethod}. `;
  }
  
  return summary;
}