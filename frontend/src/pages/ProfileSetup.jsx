import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const ProfileSetup = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    age: '',
    gender: '',
    preferredRole: '',
    experience: '',
    location: '',
    education: '',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.put('/user/profile', form);
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow w-96">
        <h2 className="text-xl font-bold mb-4">Complete Profile</h2>

        <input name="age" placeholder="Age" onChange={handleChange} className="input" />
        <input name="gender" placeholder="Gender" onChange={handleChange} className="input" />
        <input name="preferredRole" placeholder="Preferred Role" onChange={handleChange} className="input" />
        <input name="experience" placeholder="Experience" onChange={handleChange} className="input" />
        <input name="location" placeholder="Location" onChange={handleChange} className="input" />
        <input name="education" placeholder="Education" onChange={handleChange} className="input" />

        <button className="bg-purple-600 text-white px-4 py-2 rounded mt-4 w-full">
          Save & Continue
        </button>
      </form>
    </div>
  );
};

export default ProfileSetup;