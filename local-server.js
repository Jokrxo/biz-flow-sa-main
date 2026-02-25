import express from 'express';
import cors from 'cors';
// Fetch is built-in in Node 18+

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const MONO_SECRET_KEY = 'test_sk_gxbezadwrlled1o05h6x'; // User provided test key

app.post('/mono-exchange', async (req, res) => {
  try {
    console.log("------------------------------------------------");
    console.log("Incoming Request Body:", JSON.stringify(req.body, null, 2));
    
    let { code } = req.body;
    
    // Handle if code is an object (some widgets return object {code: "..."})
    if (typeof code === 'object' && code !== null) {
        console.log("Code is an object:", code);
        if (code.code) {
            code = code.code;
        } else if (code.token) {
             code = code.token;
        } else {
            // Try to find any string property
            const values = Object.values(code);
            const strVal = values.find(v => typeof v === 'string');
            if (strVal) code = strVal;
        }
    }
    
    // Ensure code is a string and trimmed
    if (typeof code === 'string') {
        code = code.trim();
    } else {
        // Force string if it's a number?
        code = String(code);
    }
    
    console.log("Final Code to send to Mono:", code, "Type:", typeof code);

    if (!code || code === "undefined" || code === "[object Object]") {
      return res.status(400).json({ error: 'Code is invalid or missing from payload' });
    }

    console.log("Exchanging code for account ID...");

    const response = await fetch('https://api.withmono.com/v2/accounts/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'mono-sec-key': MONO_SECRET_KEY,
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();
    console.log("Mono Auth Response Status:", response.status);
    console.log("Mono Auth Response Data:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error('Mono API Error:', data);
      return res.status(response.status).json({ error: data.message || 'Failed to exchange token', details: data });
    }

    console.log("Exchange successful:", data);
    
    // Check if data structure is { data: { id: ... } } or just { id: ... }
    const accountId = data.id || (data.data && data.data.id);
    console.log("Extracted Account ID:", accountId);
    
    if (!accountId) {
        return res.status(500).json({ error: 'Failed to extract Account ID from Mono response', details: data });
    }
    
    // Fetch Account Details immediately
    console.log("Fetching account details for:", accountId);
    const detailsResponse = await fetch(`https://api.withmono.com/v2/accounts/${accountId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'accept': 'application/json',
            'mono-sec-key': MONO_SECRET_KEY,
        },
    });
    
    const detailsData = await detailsResponse.json();
    
    if (!detailsResponse.ok) {
         console.error('Mono Details API Error:', detailsData);
         return res.json({ id: accountId, warning: "Failed to fetch details", error: detailsData });
    }

    // Flatten the ID to the top level so frontend can find it easily
    return res.json({ id: accountId, ...data, details: detailsData.data });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Local Mono Proxy Server running on http://localhost:${PORT}`);
});
