import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // AUTH FIELDS
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },

    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpire: {
      type: Date,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    googleId: {
      type: String,
    },

    avatar: {
      type: String,
    },

    //  PROFILE FIELDS
    age: {
      type: Number,
    },

    gender: {
      type: String,
    },

    currentCompany: {
      type: String, // e.g. Google, N/A
    },

    currentRole: {
      type: String, // e.g. Student, Junior Developer
    },
    preferredRole: {
      type: String,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },

    experience: {
      type: String, // e.g. 0, 2 years
    },

    location: {
      type: String,
    },

    education: {
      type: String,
    },

    //  PROFILE COMPLETION FLAG
    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    resumeUrl: {
      type: String,
    },

    resumeName: {
      type: String,
    },

    resumeSkills: [{
      type: String,
    }],
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("User", userSchema);
