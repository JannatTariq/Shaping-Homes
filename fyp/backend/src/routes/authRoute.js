const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = mongoose.model("User");
const Constructor = mongoose.model("Constructor");
const { geocode } = require("opencage-api-client");
const requireAuth = require("../middlewares/requireAuth");

const router = express.Router();

function validateAddress(response) {
  if (
    response &&
    response.status &&
    response.status.code === 200 &&
    response.results &&
    response.results.length > 0
  ) {
    const firstResult = response.results[0];
    if (
      firstResult.components &&
      firstResult.components.country === "Pakistan" &&
      firstResult.confidence &&
      firstResult.confidence >= 5
    ) {
      return true;
    }
  }

  return false;
}

function isValidCity(response) {
  if (
    response &&
    response.status &&
    response.status.code === 200 &&
    response.results &&
    response.results.length > 0
  ) {
    const firstResult = response.results[0];
    if (
      firstResult.components &&
      firstResult.components.country === "Pakistan" &&
      firstResult.confidence >= 3
    ) {
      // console.log(response);
      return true;
    }
  }

  return false;
}

function isPDF(fileName) {
  // console.log(fileName);
  if (!fileName) {
    return false; // Handle the case where uploadedDocument is undefined or null
  }
  const extension = fileName.split(".").pop().toLowerCase();
  return extension === "pdf";
}

router.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  // console.log(req.body);

  if (!email || !password) {
    return res.status(422).send({ error: "Must provide email and password" });
  }

  try {
    const cleanedEmail = email.trim();
    const user = await User.findOne({ email: cleanedEmail });
    const constructor = await Constructor.findOne({ email: cleanedEmail });
    // console.log(user);

    if (!user && !constructor) {
      return res.status(422).send({
        error: "Email not found",
      });
    }

    if (user != null) {
      await user.comparePassword(password);
      const token = jwt.sign({ userId: user._id }, "MY_SECRET_KEY");

      res.send({ token });
    } else if (constructor != null) {
      await constructor.comparePassword(password);
      const token = jwt.sign({ userId: constructor._id }, "MY_SECRET_KEY");

      res.send({ token });
    }
  } catch (error) {
    res
      .status(400)
      .send({ error: "An error occurred during the sign-in process." });
  }
});

router.post("/signup", async (req, res) => {
  const {
    username,
    email,
    password,
    confirmPassword,
    address,
    firstname,
    lastname,
    city,
    uploadedDocument,
    role,
  } = req.body;
  try {
    if (password !== confirmPassword) {
      return res.status(422).send("Passwords do not match");
    }
    if (!address) {
      return res.status(422).send("Address is required");
    }

    const response1 = await geocode({
      q: `${address}, Pakistan`,
      key: "494016b2e2604b44932b85fe186be028",
    });

    const isValidAddress = validateAddress(response1);

    if (!isValidAddress) {
      return res.status(422).send("Invalid address");
    }

    let user;

    const existingUser = await User.findOne({ email });
    const existingConstructor = await Constructor.findOne({ email });

    if (existingUser || existingConstructor) {
      return res.status(422).send("Email is already in use");
    }

    if (uploadedDocument) {
      const response = await geocode({
        q: `${city}, Pakistan`,
        key: "494016b2e2604b44932b85fe186be028",
      });
      if (!isValidCity(response)) {
        return res.status(400).send({ error: "Invalid city" });
      }

      user = new Constructor({
        username,
        email,
        password,
        confirmPassword,
        address,
        firstname,
        lastname,
        city,
        uploadedDocument: uploadedDocument[0].name,
        role,
      });
    } else {
      user = new User({
        username,
        email,
        password,
        confirmPassword,
        address,
      });
    }
    // console.log(user);
    await user.save();

    const token = jwt.sign({ userId: user._id }, "MY_SECRET_KEY");

    res.send({ token });
  } catch (error) {
    res
      .status(400)
      .send({ error: "An error occurred during the sign-up process." });
  }
});

router.get("/checkConstructor", async (req, res) => {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).send({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token.replace("Bearer ", ""), "MY_SECRET_KEY");
    const userId = decoded.userId;
    // console.log(userId);

    const constructor = await Constructor.findOne({ _id: userId });
    // console.log(constructor);

    if (constructor) {
      res.send(true);
    } else {
      res.send(false);
    }
  } catch (error) {
    // console.error("Error checking constructor:", error);
    res.status(500).send({ error: "Internal Server Error" });
  }
});

router.get("/getWorkers", async (req, res) => {
  try {
    const workers = await Constructor.find();
    // console.log(workers);

    const separatedWorkers = {
      contractor: [],
      architect: [],
      interior_designer: [],
      blacksmith: [],
      electrician: [],
      plumber: [],
    };

    workers.forEach((worker) => {
      if (worker.role === "Contractor") {
        separatedWorkers.contractor.push(worker);
      } else if (worker.role === "Architect") {
        separatedWorkers.architect.push(worker);
      } else if (worker.role === "Interior Designer") {
        separatedWorkers.interior_designer.push(worker);
      } else if (worker.role === "BlackSmith") {
        separatedWorkers.blacksmith.push(worker);
      } else if (worker.role === "Electrician") {
        separatedWorkers.electrician.push(worker);
      } else if (worker.role === "Plumber") {
        separatedWorkers.plumber.push(worker);
      }
    });

    res.json(separatedWorkers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/currentUser", requireAuth, async (req, res) => {
  const userId = req.user.id;
  res.json({ userId });
});

router.get("/userProfile", requireAuth, async (req, res) => {
  const userId = req.user.id;
  // console.log(userId);
  let user = await User.findById(userId);
  if (!user) {
    user = await Constructor.findById(userId);
  }
  res.json(user);
});

router.post("/createReviews", requireAuth, async (req, res) => {
  try {
    const { rating, comment, workerId } = req.body;

    // console.log(req.user);
    const review = {
      user: req.user._id,
      name: req.user.username,
      rating: Number(rating),
      comment,
    };
    // console.log(review);

    const worker = await Constructor.findById(workerId);
    // console.log(worker.reviews);

    const isReviewed = worker.reviews.find(
      (r) => r.user.toString() === req.user._id.toString()
    );
    // console.log(isReviewed);

    if (isReviewed) {
      worker.reviews.forEach((review) => {
        if (review.user.toString() === req.user._id.toString()) {
          review.comment = comment;
          review.rating = rating;
        }
      });
    } else {
      worker.reviews.push(review);
      worker.numOfReviews = worker.reviews.length;
    }

    worker.ratings =
      worker.reviews.reduce((acc, item) => item.rating + acc, 0) /
      worker.reviews.length;
    // console.log(worker);

    await worker.save();

    res.send({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/getReviews/:id", requireAuth, async (req, res) => {
  const workerId = req.params.id;
  const worker = await Constructor.findById(workerId);
  // console.log(worker);
  res.json({
    success: true,
    reviews: worker.reviews,
  });
});

router.delete("/deleteReviews/:reviewId", requireAuth, async (req, res) => {
  const reviewId = req.params.reviewId;
  const worker = await Constructor.findOneAndUpdate(
    { "reviews._id": reviewId },
    {
      $pull: { reviews: { _id: reviewId } },
      $inc: { numOfReviews: -1 },
    },
    { new: true }
  );

  // console.log(worker);
  if (!worker) {
    return res
      .status(404)
      .json({ success: false, message: "Review not found" });
  }
  const totalRatings = worker.reviews.reduce(
    (acc, review) => acc + review.rating,
    0
  );
  const numOfReviews = worker.numOfReviews;
  // console.log(numOfReviews);
  const ratings = numOfReviews > 0 ? totalRatings / numOfReviews : 0;
  // console.log(ratings);

  worker.ratings = ratings;
  // console.log(worker);
  await worker.save();

  res.json({ success: true });
});

module.exports = router;
