const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true }, // Email is optional but must be unique if provided
  phone: { type: String, unique: true, sparse: true }, // Phone is optional but must be unique if provided
  password: { type: String, required: true },
  verified: { type: Boolean, default: false }, // User is verified after either email or phone verification
  verificationToken: { type: String }, // Token for email verification
  phoneVerificationToken: { type: String }, // Token for phone verification
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
