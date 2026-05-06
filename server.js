require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
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
      success_url: "http://localhost:5500/success.html",
      cancel_url: "http://localhost:5500/cart.html",
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