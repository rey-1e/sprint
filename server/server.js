require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Use '*' to avoid CORS blocking during development
app.use(cors({ origin: '*' }));
app.use(express.json());

app.post('/analyze', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });

    try {
        const prompt = `Analyze this code and reply ONLY with a JSON object format like: {"time":"O(n)","space":"O(1)"}. Do not include markdown backticks or any conversation text.\n\nCode:\n${code}`;
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        
        // Strip markdown backticks if Gemini accidentally includes them
        const cleanedText = text.replace(/^```(json)?/i, '').replace(/```$/i, '').trim();
        const parsedData = JSON.parse(cleanedText);

        res.json(parsedData);
    } catch (error) {
        console.error('Error with Gemini API:', error);
        res.status(500).json({ error: 'Failed to analyze code' });
    }
});

app.listen(port, () => {
    console.log(`Sprint server running on port ${port}`);
});