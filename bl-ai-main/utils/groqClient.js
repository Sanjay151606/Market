export const generateInsightsFromGroq = async (productData, type = 'general') => {
    try {
        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey || groqApiKey === 'your_groq_api_key') {
            console.warn('Groq API Key missing. Returning fallback mock data.');
            return generateFallbackInsights(type);
        }

        const { default: Groq } = await import('groq-sdk');
        const groq = new Groq({ apiKey: groqApiKey });

        const systemPrompt = `You are a world-class e-commerce business analyst AI.
You must analyze the provided data context and generate 2 highly actionable business insights.
Return ONLY valid JSON with this exact structure, no markdown wrapping, no extra text:
[
  {
    "title": "Short catchy title",
    "description": "Detailed explanation of the insight",
    "urgency_level": "high" | "medium" | "low",
    "type": "pricing" | "logistics" | "marketing" | "inventory"
  }
]`;

        const userPrompt = `Generate business insights for these products based on our ${type} analysis context:\n${JSON.stringify(productData, null, 2)}`;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.4,
            max_tokens: 1024,
            top_p: 1,
            response_format: { type: "json_object" }
        });

        const responseContent = completion.choices[0]?.message?.content || "[]";

        try {
            // Sometimes LLMs wrap in an object even with json_object if they misunderstand array vs object root.
            const parsed = JSON.parse(responseContent);
            if (Array.isArray(parsed)) return parsed;
            if (parsed.insights && Array.isArray(parsed.insights)) return parsed.insights;
            return [parsed]; // fallback if it returned a single object
        } catch (parseError) {
            console.error('Groq JSON parsing error:', parseError);
            return generateFallbackInsights(type);
        }
    } catch (error) {
        console.error('Groq API Error:', error);
        return generateFallbackInsights(type);
    }
};

const generateFallbackInsights = (type) => {
    return [
        {
            title: "Optimize Free Shipping Threshold",
            description: "Based on your average order value, increasing the free shipping threshold by 15% could improve margins without significantly reducing conversion rates.",
            urgency_level: "medium",
            type: "logistics"
        },
        {
            title: "Price Match Opportunity",
            description: "Competitors have recently adjusted prices downward on key inventory items. A slight price matching strategy is recommended to maintain BSR.",
            urgency_level: "high",
            type: "pricing"
        }
    ];
};
