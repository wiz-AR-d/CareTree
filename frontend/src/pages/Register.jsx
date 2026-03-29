import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { HeartPulse } from 'lucide-react';

const Register = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('doctor');
    const { register, isLoading, error } = useAuthStore();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        const success = await register(name, email, password, role);
        if (success) {
            navigate('/dashboard');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center text-teal-600">
                    <HeartPulse size={48} />
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
                    Create CareTree Account
                </h2>
                <p className="mt-2 text-center text-sm text-slate-600">
                    Already have an account? <Link to="/login" className="font-medium text-teal-600 hover:text-teal-500">Sign in here</Link>
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                                {error}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Full Name</label>
                            <div className="mt-1">
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700">Email address</label>
                            <div className="mt-1">
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700">Password</label>
                            <div className="mt-1">
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700">Role</label>
                            <div className="mt-1">
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    className="block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm rounded-md"
                                >
                                    <option value="doctor">Medical Doctor</option>
                                    <option value="nurse">Triage Nurse</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-2.5 px-4 rounded-xl shadow-md text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 transition-all duration-200 transform hover:-translate-y-0.5"
                            >
                                {isLoading ? 'Creating...' : 'Create Account'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Register;
