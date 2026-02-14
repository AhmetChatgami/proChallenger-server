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
    origin: [process.env.CLIENT_DOMAIN],
    credentials: true,
    optionSuccessStatus: 200,
  }),
);
app.use(express.json());

// JWT Middleware
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized access!", err });
  }
};

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
    const registeredCollection = db.collection("registeredContests");
    const usersCollection = db.collection("users");

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

    // Payment with Stripe integression
    //Method -1
    console.log("Route Hit!");
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo?.price) * 100;
      console.log(paymentInfo);
      //   res.send(paymentInfo);
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: paymentInfo?.name,
                description: paymentInfo?.description,
                images: [paymentInfo?.image],
              },
            },
            quantity: paymentInfo?.quantity,
          },
        ],
        customer_email: paymentInfo?.customer?.email,
        mode: "payment",
        metadata: {
          contestId: paymentInfo?.contestId,
          customer: paymentInfo?.customer.email,
        },
        success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,

        cancel_url: `${process.env.CLIENT_DOMAIN}/contest/${paymentInfo?.contestId}`,
      });
      console.log("Stripe session", session);
      res.send({ url: session.url });
    });

    app.post("/payment-success", async (req, res) => {
      const { sessionId } = req.body;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log("payment success", session);
      const contest = await contestCollection.findOne({
        _id: new ObjectId(session.metadata.contestId),
      });

      const registered = await registeredCollection.findOne({
        transactionId: session.payment_intent,
      });

      if (session.status === "complete" && contest && !registered) {
        const registerInfo = {
          contestId: session.metadata.contestId,
          transactionId: session.payment_intent,
          customer: session.metadata.customer,
          status: "pending",
          creator: contest.creator,
          name: contest.name,
          category: contest.category,
          quantity: 1,
          price: session.amount_total / 100,
          image: contest.image,
        };
        console.log("Registration info -->", registerInfo);
        const result = await registeredCollection.insertOne(registerInfo);

        // update quntity in contest collection
        await contestCollection.updateOne(
          {
            _id: new ObjectId(session.metadata.contestId),
          },
          { $inc: { quantity: -1 } },
        );

        return res.send({
          transactionId: session.payment_intent,
          registerId: registered._id,
        });
      }
    });
    // Paymet integression end

    // get contest by email
    app.get("/my-contests", verifyJWT, async (req, res) => {
      const result = await registeredCollection
        .find({
          customer: req.tokenEmail,
        })
        .toArray();
      res.send(result);
    });

    //  manage contest by creator email
    app.get("/manage-contests/:email", async (req, res) => {
      const email = req.params.email;

      const result = await registeredCollection
        .find({
          "creator.email": email,
        })
        .toArray();
      res.send(result);
    });

    //  manage all contest by creator email
    app.get("/my-inventory/:email", async (req, res) => {
      const email = req.params.email;

      const result = await contestCollection
        .find({
          "creator.email": email,
        })
        .toArray();
      res.send(result);
    });

    // Save or Update- users controller
    app.post("/user", async (req, res) => {
      const userData = req.body;
      userData.created_at = new Date().toISOString();
      userData.last_login = new Date().toISOString();
      userData.role = "customer";

      const query = { email: userData.email };

      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        const result = await usersCollection.updateOne(query, {
          $set: {
            last_login: new Date().toISOString(),
            name: userData.name,
            image: userData.image,
          },
        });
        return res.send(result);
      }

      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    // get user role
    app.get("/user/role", verifyJWT, async (req, res) => {
      const result = await usersCollection.findOne({ email: req.tokenEmail });
      res.send({ role: result?.role });
    });

    // send a ping to confirm a successful connection
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

// 4. Routes
app.get("/", (req, res) => {
  res.send("ProChallenger Server is running...");
});

// 5. Server Listen
app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
