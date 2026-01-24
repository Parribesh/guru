import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginRequestSchema, registerRequestSchema, type AuthFormData } from '../../schemas/authSchemas'
import { login, register } from '../../api/auth_api'

export const AuthForm = ({ onAuthSuccess }: { onAuthSuccess?: () => void }) => {
    const [form, setForm] = useState<AuthFormData>({
        email: '',
        password: '',
        confirm_password: '',
    })
    const [isLoading, setIsLoading] = useState(false)
    const [isLogin, setIsLogin] = useState(true)
    const [errors, setErrors] = useState<Partial<Record<keyof AuthFormData, string>>>({})
    const navigate = useNavigate()

    const validateAndSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setErrors({})

        try {
            setIsLoading(true)

            if (isLogin) {
                // Validate login form
                const loginData = { email: form.email, password: form.password }
                const validatedLoginForm = loginRequestSchema.parse(loginData)
                await login(validatedLoginForm)
            } else {
                // Validate register form
                const validatedRegisterForm = registerRequestSchema.parse(form)
                await register(validatedRegisterForm)
            }
            setIsLoading(false)
            onAuthSuccess?.()
            navigate('/courses', { replace: true })
        } catch (error: unknown) {
            setIsLoading(false)
            const err = error as { message?: string; response?: { data?: { detail?: string } } }
            console.error('Submission error:', err?.message)
            setErrors({ email: err?.response?.data?.detail || 'An error occurred' })
        }
    }

    const toggleMode = () => {
        setIsLogin(!isLogin)
        setErrors({})
        // Reset form when switching modes
        setForm({
            email: '',
            password: '',
            confirm_password: '',
        })
    }
    return (
        <div className="auth-form bg-gray-100 p-4 rounded-md max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-4">{isLogin ? 'Login' : 'Register'}</h1>
            <form className="flex flex-col gap-2" onSubmit={validateAndSubmit}>
                <div>
                    <label className="text-sm font-bold">Email</label>
                    <input
                        className={`w-full p-2 rounded-md border ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        required
                    />
                    {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                </div>

                <div>
                    <label className="text-sm font-bold">Password</label>
                    <input
                        className={`w-full p-2 rounded-md border ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        required
                    />
                    {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
                </div>

                {!isLogin && (
                    <div>
                        <label className="text-sm font-bold">Confirm Password</label>
                        <input
                            className={`w-full p-2 rounded-md border ${errors.confirm_password ? 'border-red-500' : 'border-gray-300'}`}
                            type="password"
                            value={form.confirm_password || ''}
                            onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                            required
                        />
                        {errors.confirm_password && <p className="text-red-500 text-sm mt-1">{errors.confirm_password}</p>}
                    </div>
                )}

                <button
                    className="w-full p-2 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                    type="submit"
                    disabled={isLoading}
                >
                    {isLoading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
                </button>

                <button
                    className="w-full p-2 rounded-md bg-gray-500 text-white hover:bg-gray-600"
                    type="button"
                    onClick={toggleMode}
                    disabled={isLoading}
                >
                    {isLogin ? 'Need to Register?' : 'Already have an account?'}
                </button>

                {isLoading && <p className="text-sm text-gray-500 text-center">Loading...</p>}
            </form>
        </div>
    )
}