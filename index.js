require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");

const port = process.env.PORT || 3000;
const app = express();

// 1. Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
    optionSuccessStatus: 200,
  }),
);
app.use(express.json());

// 2. Firebase Admin Setup (try-catch for error handling)
try {
  const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
    "utf-8",
  );
  const serviceAccount = JSON.parse(decoded);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  console.log("Firebase Admin Initialized");
} catch (error) {
  console.error("Firebase Initialization Error:", error.message);
}

// 3. MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0gdtq1d.mongodb.net/prochallenger?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("prochallengerdb");
    const contestCollection = db.collection("contests");

    // save contest data in DB
    app.post("/contests", async (req, res) => {
      const contestData = req.body;
      console.log(contestData);
      const result = await contestCollection.insertOne(contestData);
      res.send(result);
    });

    // get contest data from DB
    app.get("/contests", async (req, res) => {
      const result = await contestCollection.find().toArray();
      res.send(result);
    });

    //  DB to client
    app.get("/contests/:id", async (req, res) => {
      const id = req.params.id;
      const result = await contestCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // await client.connect();

    
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);
// Payment with Stripe integression
    console.log("Route Hit!")
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo)
      res.send(paymentInfo)
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price: {},
            quantity: 1,
          },
        ],
        mode: "payment",
      });
    });
// 4. Routes
app.get("/", (req, res) => {
  res.send("ProChallenger Server is running...");
});

// 5. Server Listen
app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
