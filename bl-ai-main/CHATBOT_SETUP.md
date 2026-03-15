# AI Chatbot Assistant - Implementation Guide

## Overview
A new AI-powered chatbot assistant has been added to MarketMind AI, providing on-demand answers to user questions about website features, functionality, and best practices.

## Features

### 1. **Interactive Chat Interface**
   - Floating chat widget in the bottom-right corner of the screen
   - Minimizable/maximizable chat window
   - Conversation history within session
   - Real-time message responses with typing indicators
   - Responsive design for mobile and desktop

### 2. **AI-Powered Responses**
   - Uses Groq's Llama 3.1 8B model for intelligent responses
   - Maintains conversation context with message history
   - Specialized system prompt for MarketMind AI domain knowledge
   - Answers questions about:
     - Feature explanations
     - How to use various modules
     - Best practices for e-commerce optimization
     - Pricing, logistics, reviews, and competitor insights
     - Account settings and profile management

### 3. **Security**
   - Authentication required (token-based)
   - Only authenticated users can access the chatbot
   - Messages are processed server-side

## Files Added

### Backend
- **`/routes/chatbot.js`** - Express route handler for chat messages
  - Endpoint: `POST /api/chatbot/message`
  - Requires authentication
  - Accepts message and conversation history
  - Returns AI-generated response

### Frontend
- **`/src/components/ChatAssistant.jsx`** - React component for chat UI
  - Floating chat widget with toggle button
  - Message display with timestamps
  - Input form with send button
  - Typing indicators and error handling
  - Responsive design

- **`/src/components/ChatAssistant.css`** - Styling for chat interface
  - Modern gradient design matching MarketMind branding
  - Animation effects (slide-up, fade-in, typing indicator)
  - Mobile-responsive layouts

### Integration Files Updated
- **`/server.js`** - Registered chatbot route
- **`/src/App.jsx`** - Integrated ChatAssistant component
- **`/src/utils/api.js`** - Added `sendChatMessage()` method

## Usage

### For Users
1. Click the floating purple button in the bottom-right corner
2. Type your question about MarketMind AI features
3. Press Enter or click the send button
4. Receive an AI-generated response
5. Continue the conversation naturally
6. Close the chat with the X button

### For Developers

#### Using the API Manually
```javascript
const response = await fetch('/api/chatbot/message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    message: 'How do I track competitor prices?',
    conversationHistory: [] // Optional: array of previous messages
  })
});

const data = await response.json();
console.log(data.response); // AI response
```

#### Using the API Client
```javascript
import api from './src/utils/api';

const result = await api.sendChatMessage(
  'How does the price tracker work?',
  conversationHistory
);

console.log(result.response);
```

## Configuration

### Environment Variables
Ensure the following environment variable is set:
```
GROQ_API_KEY=your_groq_api_key_here
```

### Customization

#### Change System Prompt
Edit `/routes/chatbot.js` line 25-34 to modify the assistant's behavior and knowledge:
```javascript
const systemPrompt = `Your custom instructions here...`;
```

#### Modify Chat Style
Edit `/src/components/ChatAssistant.css` to customize:
- Color scheme (search for `#667eea` and `#764ba2`)
- Chat window size
- Font styles
- Animation speeds

#### Adjust AI Parameters
In `/routes/chatbot.js`, modify:
```javascript
temperature: 0.7,  // Lower = more focused, Higher = more creative
max_tokens: 1024,  // Max response length
```

## Features & Capabilities

### What the Chatbot Can Help With
✅ Answer questions about MarketMind AI features
✅ Explain how to use price tracking
✅ Provide competitor radar guidance
✅ Discuss logistics optimization
✅ Explain review analysis features
✅ Guide users on insights interpretation
✅ Suggest best practices for e-commerce
✅ Help with account and profile settings

### Conversation Context
- The chatbot maintains the last 10 messages for context
- This helps provide more coherent and relevant responses
- Each new chat session starts fresh (messages stored in session state only)

## Testing

### Quick Test
1. Log in to MarketMind AI
2. Click the purple chat button in the bottom right
3. Ask: "What features does MarketMind offer?"
4. Verify you receive an AI response

### Testing with cURL (Linux/Mac)
```bash
curl -X POST http://localhost:8000/api/chatbot/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "How do I track prices?",
    "conversationHistory": []
  }'
```

## Error Handling

### Missing API Key
If `GROQ_API_KEY` is not configured, the chatbot returns:
```json
{
  "success": false,
  "error": "AI service not configured",
  "response": "I'm currently unavailable due to missing API configuration."
}
```

### Network Issues
The component shows error messages and allows users to retry.

## Performance Considerations

- Each message requires a Groq API call
- Response time typically 1-3 seconds
- Typing indicator shown during processing
- Message history limited to last 10 messages to optimize token usage
- Rate limiting applied at server level (100 requests per 15 minutes)

## Future Enhancements

Potential improvements:
- [ ] Persistent chat history (store conversations in database)
- [ ] Suggested question prompts
- [ ] File upload support for data analysis
- [ ] Multi-language support
- [ ] Chat analytics and metrics
- [ ] Integration with help/FAQ database
- [ ] Voice input/output capabilities
- [ ] Custom knowledge base from internal documentation

## Troubleshooting

### Chat button not appearing
- Ensure you're logged in
- Check browser console for errors
- Verify ChatAssistant is imported in App.jsx

### No response from chatbot
- Check GROQ_API_KEY is set in .env
- Verify network request in browser DevTools
- Check server logs for errors
- Ensure user is authenticated

### Slow responses
- Check Groq API status
- Reduce temperature value for faster responses
- Reduce max_tokens limit

## Support
For issues or feature requests, check the server logs and browser console for detailed error messages.
