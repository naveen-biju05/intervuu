import mongoose from "mongoose";

const JobSchema = new mongoose.Schema({
  company: { type: String, required: true },
  logo: { type: String, default: "" },
  title: { type: String, required: true },
  location: { type: String, default: "" },
  experience: { type: String, default: "" },
  summary: { type: String, default: "" },
  description: { type: String, default: "" },
  skills: [{ type: String }],
  required_skills: [{ type: String }],
  job_type: { type: String, default: "" },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Job", JobSchema);
