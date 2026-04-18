require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

app.use(cors({ origin: '*' }));
app.use(express.json());

app.post('/analyze', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });

    try {
        const prompt = `Analyze this code and reply ONLY with a valid JSON object. No explanation, no markdown formatting, no conversational text. Example format: {"time":"O(n)", "space":"O(1)"}\n\nCode:\n${code}`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        // FIX: Foolproof JSON parsing. Finds the first '{' and the last '}'
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error("Invalid response format from Gemini: " + text);
        }

        const jsonString = text.substring(jsonStart, jsonEnd + 1);
        const parsedData = JSON.parse(jsonString);

        res.json(parsedData);
    } catch (error) {
        console.error('Error with server logic/Gemini API:', error);
        res.status(500).json({ error: 'Failed to analyze code' });
    }
});

app.listen(port, () => {
    console.log(`Sprint server running on port ${port}`);
});