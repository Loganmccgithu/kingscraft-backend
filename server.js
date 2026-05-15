require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());

// STRIPE WEBHOOK MUST USE RAW BODY
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    try {
      const cart = JSON.parse(session.metadata.cart || "[]");

      const orderText = cart.map(item => `
Product: ${item.name}
Size: ${item.size || "N/A"}
Price: $${item.price}
`).join("\n");

      const address = session.customer_details?.address;

      if (process.env.DISCORD_WEBHOOK_URL) {
        await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            content:
`🛒 PAID ORDER

Customer Name: ${session.customer_details?.name || "N/A"}
Customer Email: ${session.customer_details?.email || "N/A"}

${orderText}

Total Paid: $${(session.amount_total / 100).toFixed(2)} CAD

Shipping Address:
${address?.line1 || ""}
${address?.line2 || ""}
${address?.city || ""}
${address?.state || ""}
${address?.postal_code || ""}
${address?.country || ""}

Stripe Checkout ID:
${session.id}`
          })
        });
      }

    } catch (err) {
      console.error("Discord notification failed:", err);
    }
  }

  res.json({ received: true });
});

app.use(express.json());

// CREATE CHECKOUT SESSION
app.post("/create-checkout-session", async (req, res) => {
  const { cart } = req.body;

  try {
    const line_items = cart.map(item => ({
      price_data: {
        currency: "cad",
        product_data: {
          name: `${item.name} (Size: ${item.size || "N/A"})`,
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items,
      mode: "payment",

      metadata: {
        cart: JSON.stringify(cart)
      },

      shipping_address_collection: {
        allowed_countries: ["CA", "US"],
      },

      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: {
              amount: 0,
              currency: "cad",
            },
            display_name: "Standard Shipping (No Tracking)",
            delivery_estimate: {
              minimum: {
                unit: "business_day",
                value: 5,
              },
              maximum: {
                unit: "business_day",
                value: 10,
              },
            },
          },
        },
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: {
              amount: 2500,
              currency: "cad",
            },
            display_name: "Tracked Shipping",
            delivery_estimate: {
              minimum: {
                unit: "business_day",
                value: 2,
              },
              maximum: {
                unit: "business_day",
                value: 5,
              },
            },
          },
        },
      ],

      success_url: "https://kingscraft.ca/success.html",
      cancel_url: "https://kingscraft.ca/cart.html",
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating checkout session");
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});