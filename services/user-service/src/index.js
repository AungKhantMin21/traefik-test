const express = require("express");
const axios = require("axios");
const db = require("./db");

const app = express();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://auth-service:4000";
const PORT = process.env.PORT || 4001;

async function getUser(userId) {
  const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
  return result.rows[0];
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'user-service' });
});

app.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Missing token" });
  }

  try {
    const response = await axios.get(
      `${AUTH_SERVICE_URL}/verify`,
      { headers: { Authorization: authHeader } }
    );

    console.log(response.data);

    const user = await getUser(response.data.user.userId);

    res.json({
      id: user.id,
      email: user.email
    });
  } catch (err) {
    console.error('Error in /me endpoint:', err);
    if (err.response && err.response.status === 401) {
      return res.status(401).json({ message: "Invalid token" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`User service running on port ${PORT}`);
});