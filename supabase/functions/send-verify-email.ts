import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  email: string;
  userId: string;
  code: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, userId, code }: RequestBody = await req.json();
    const apiToken = Deno.env.get("MAILERSEND_API_TOKEN")!;

    const response = await fetch("https://api.mailersend.com/v1/mails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "noreply@freshflip.game", name: "FreshFlip" },
        to: [{ email }],
        subject: "Your FreshFlip Verification Code",
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #00b060; margin-bottom: 20px;">FreshFlip Verification</h2>
            <p style="color: #333; font-size: 16px;">Your verification code is:</p>
            <div style="background: #f0f0f0; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #00b060; margin: 20px 0;">
              ${code}
            </div>
            <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
          </div>
        `,
        text: `Your FreshFlip verification code is: ${code}. This code expires in 10 minutes.`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mailersend error: ${error}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});