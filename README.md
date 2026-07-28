# 🎯 Intervuu

Intervuu is an AI-powered mock interview platform that helps users prepare for technical and non-technical interviews through personalized question generation, answer evaluation, and performance analytics.



## 🚀 Features

* 🤖 AI-generated interview questions based on job role and experience level
* 📝 AI evaluation of user responses with detailed feedback
* 📊 Interview performance report with strengths and areas for improvement
* 📈 Analytics dashboard for interview insights
* 👤 User authentication and secure login
* 💼 Support for multiple job roles
* 📂 Resume upload support
* 🌐 Responsive user interface



## 🛠️ Tech Stack

### Frontend

* React.js
* Vite
* React Router
* Axios
* CSS

### Backend

* Node.js
* Express.js
* MongoDB
* Mongoose
* JWT Authentication
* Multer

### AI

* Google Generative Language API
* Gemini Models



## 📁 Project Structure

```
intervuu/  
│  
├── backend/  
│ ├── config/  
│ ├── middleware/  
│ ├── models/  
│ ├── routes/  
│ ├── services/  
│ ├── uploads/  
│ └── server.js  
│  
├── frontend/  
│ ├── public/  
│ ├── src/  
│ └── package.json  
│  
└── README.md  

```



## ⚙️ Installation

### 1. Clone the repository

```
git clone https://github.com/naveen-biju05/intervuu.git  
cd intervuu  

```

### 2. Install Backend Dependencies

```
cd backend  
npm install  

```

### 3. Install Frontend Dependencies

```
cd ../frontend  
npm install  

```



## 🔐 Environment Variables

Create a `.env` file inside the `backend` folder.

Example:

```
PORT=5000  
  
MONGO_URI=your_mongodb_connection_string  
  
JWT_SECRET=your_jwt_secret  
  
GEMMA_API_KEY=your_google_ai_api_key  
  
GEMMA_MODEL=gemini-3.1-flash-lite  

```



## ▶️ Running the Application

### Backend

```
cd backend  
npm run dev  

```

### Frontend

```
cd frontend  
npm run dev  

```

## 📌 Future Improvements

* Voice-based interviews
* Video interview support
* Resume analysis
* Company-specific interview preparation
* Coding interview module
* Leaderboard and progress tracking



## 👨‍💻 Authors

* **Naveen Biju Koottala**
* **Gali Manish Kumar**

