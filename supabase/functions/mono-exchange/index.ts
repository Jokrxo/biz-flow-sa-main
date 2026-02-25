import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();

    if (!code) {
      return new Response(JSON.stringify({ error: 'Code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log("Exchanging code for account ID...");

    const response = await fetch('https://api.withmono.com/v2/accounts/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'mono-sec-key': 'test_sk_gxbezadwrlled1o05h6x', // User provided test key
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Mono API Error:', data);
      return new Response(JSON.stringify({ error: data.message || 'Failed to exchange token' }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log("Exchange successful:", data);
    
    const accountId = data.id;
    
    // Fetch Account Details immediately to return to frontend
    console.log("Fetching account details for:", accountId);
    const detailsResponse = await fetch(`https://api.withmono.com/v2/accounts/${accountId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'accept': 'application/json',
            'mono-sec-key': 'test_sk_gxbezadwrlled1o05h6x',
        },
    });
    
    const detailsData = await detailsResponse.json();
    
    if (!detailsResponse.ok) {
         console.error('Mono Details API Error:', detailsData);
         // Return the ID at least, so we can retry fetching details later
         return new Response(JSON.stringify({ id: accountId, warning: "Failed to fetch details", error: detailsData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         });
    }

    return new Response(JSON.stringify({ ...data, details: detailsData.data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
