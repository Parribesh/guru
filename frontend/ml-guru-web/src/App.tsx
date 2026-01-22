import { useEffect, useState } from 'react'
import './App.css'
import { GuruChat } from './views/guru/GuruChat'
import { AuthForm } from './views/auth/AuthForm'
import { axiosInstance } from './config/axiosConfig'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  useEffect(() => {
    const checkAuth = async () => {
      axiosInstance.get('/auth/me').then((response) => {
        console.log(response.data)
        setIsLoggedIn(true)
        }).catch((error) => {
        console.error(error.response.data)
        setIsLoggedIn(false)
        })
    }
    checkAuth()
  }, [])
  return (
    <div className="app">
      <h1>ML Guru</h1>
      {isLoggedIn ? (
        <GuruChat />
      ) : (
        <AuthForm />
      )}
    </div>
  )
}

export default App
