import React, { useState } from 'react';
import { LogIn, Database, ShieldCheck, Zap, Share2, UserPlus, Mail, Lock, User, CheckCircle2, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';

const LoginPage: React.FC = () => {
    const { login } = useAuthStore();
    const { setCurrentProject } = useProjectStore();
    const [isSignup, setIsSignup] = useState(false);
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [invitationCode, setInvitationCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const inviteCode = params.get('invite');
        const invitedEmail = params.get('email');

        if (inviteCode) {
            setInvitationCode(inviteCode.toUpperCase());
        }

        if (invitedEmail) {
            setEmail(invitedEmail);
            // Check if user exists to decide whether to show login or signup
            const checkUser = async () => {
                try {
                    const AUTH_API = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:3001/api/auth';
                    const response = await fetch(`${AUTH_API}/check-email?email=${encodeURIComponent(invitedEmail)}`);
                    const data = await response.json();
                    if (data.exists) {
                        setIsSignup(false);
                    } else {
                        setIsSignup(true);
                    }
                } catch (err) {
                    console.error('Check email failed:', err);
                }
            };
            checkUser();
        }

        if (inviteCode || invitedEmail) {
            // Optionally clear the URL param for cleanliness
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    const API_URL = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:3001/api/auth';

    const handleRequestCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password || !name || !confirmPassword) {
            setError('모든 정보를 입력해주세요.');
            return;
        }

        if (password !== confirmPassword) {
            setError('비밀번호가 일치하지 않습니다.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_URL}/request-verification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '인증 코드 발송에 실패했습니다.');
            }

            setIsCodeSent(true);
            setSuccessMessage('인증 코드가 이메일로 발송되었습니다.');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const endpoint = isSignup ? '/signup' : '/login';
            const body = isSignup
                ? { email, password, name, code: verificationCode }
                : { email, password };

            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '인증에 실패했습니다.');
            }

            localStorage.setItem('auth-token', data.token);
            login(data.user, data.token);

            // If there's an invitation code, store it for ProjectListPage to handle
            if (invitationCode.trim()) {
                sessionStorage.setItem('pending-invite', invitationCode.trim());
            }

            setCurrentProject(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGuestLogin = () => {
        const guestUser = {
            id: `guest_${Math.floor(Math.random() * 10000)}`,
            email: 'guest@test.com',
            name: `게스트 ${Math.floor(Math.random() * 100)}`,
            picture: undefined,
        };
        setCurrentProject(null);
        login(guestUser);
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-100/50 rounded-full blur-[120px]" />

            <div className="max-w-[1000px] w-full grid md:grid-cols-2 bg-white rounded-[32px] shadow-2xl shadow-blue-900/10 overflow-hidden border border-gray-100">
                {/* Left Side: Branding & Features */}
                <div className="p-12 bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />

                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-12">
                            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl border border-white/30">
                                <Database size={28} />
                            </div>
                            <span className="text-2xl font-black tracking-tight uppercase">Blue Print Lab</span>
                        </div>

                        <h1 className="text-4xl font-bold leading-tight mb-6">
                            데이터베이스 설계의<br />
                            새로운 기준
                        </h1>
                        <p className="text-blue-100 text-lg mb-12 leading-relaxed">
                            직관적인 인터페이스와 강력한 협업 도구로 쉽고 빠르게 데이터베이스 구조를 설계하세요.
                        </p>

                        <div className="space-y-6">
                            <div className="flex items-center gap-4 group">
                                <div className="p-2 bg-white/10 rounded-lg group-hover:bg-white/20 transition-colors">
                                    <Zap size={20} className="text-blue-200" />
                                </div>
                                <span className="font-medium text-blue-50">실시간 다이어그램 시각화</span>
                            </div>
                            <div className="flex items-center gap-4 group">
                                <div className="p-2 bg-white/10 rounded-lg group-hover:bg-white/20 transition-colors">
                                    <ShieldCheck size={20} className="text-blue-200" />
                                </div>
                                <span className="font-medium text-blue-50">안전한 데이터 관리 및 보안</span>
                            </div>
                            <div className="flex items-center gap-4 group">
                                <div className="p-2 bg-white/10 rounded-lg group-hover:bg-white/20 transition-colors">
                                    <Share2 size={20} className="text-blue-200" />
                                </div>
                                <span className="font-medium text-blue-50">손쉬운 협업 및 공유 기능</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 text-sm text-blue-200/60 relative z-10">
                        © 2026 2QuadrillionTae. All rights reserved.
                    </div>
                </div>

                {/* Right Side: Auth Form */}
                <div className="p-12 flex flex-col justify-center bg-white">
                    <div className="max-w-[360px] mx-auto w-full">
                        <div className="mb-10 text-center md:text-left">
                            <h2 className="text-3xl font-bold text-gray-900 mb-3">
                                {isSignup ? (isCodeSent ? '인증 코드 입력' : '회원가입') : '환영합니다!'}
                            </h2>
                            <p className="text-gray-500">
                                {isSignup
                                    ? (isCodeSent ? `${email}로 발송된 코드를 입력하세요.` : '새 계정을 생성하고 시작해보세요.')
                                    : '서비스 이용을 위해 로그인을 진행해주세요.'}
                            </p>
                        </div>

                        <form onSubmit={isSignup && !isCodeSent ? handleRequestCode : handleAuth} className="space-y-4">
                            {!isCodeSent && (
                                <>
                                    {isSignup && (
                                        <div className="space-y-1.5">
                                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 ml-1">
                                                <User size={14} className="text-blue-500" />
                                                이름
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="이름"
                                                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-gray-300"
                                            />
                                        </div>
                                    )}
                                    <div className="space-y-1.5">
                                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 ml-1">
                                            <Mail size={14} className="text-blue-500" />
                                            이메일
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="example@email.com"
                                            className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-gray-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 ml-1">
                                            <Lock size={14} className="text-blue-500" />
                                            비밀번호
                                        </label>
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-gray-300"
                                        />
                                    </div>

                                    {isSignup && (
                                        <div className="space-y-1.5">
                                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 ml-1">
                                                <ShieldCheck size={14} className={`transition-colors ${confirmPassword && password !== confirmPassword ? 'text-red-500' : 'text-blue-500'}`} />
                                                비밀번호 확인
                                            </label>
                                            <input
                                                type="password"
                                                required
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className={`w-full px-5 py-3.5 bg-gray-50 border rounded-2xl focus:bg-white focus:ring-4 outline-none transition-all placeholder:text-gray-300 ${confirmPassword && password !== confirmPassword
                                                    ? 'border-red-200 focus:ring-red-500/10 focus:border-red-500'
                                                    : 'border-gray-100 focus:ring-blue-500/10 focus:border-blue-500'
                                                    }`}
                                            />
                                            {confirmPassword && password !== confirmPassword && (
                                                <p className="text-[11px] text-red-500 ml-1 font-medium animate-in fade-in slide-in-from-top-1">비밀번호가 일치하지 않습니다.</p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {isCodeSent && (
                                <div className="space-y-1.5 animate-in slide-in-from-right-4 duration-300">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 ml-1">
                                        <ShieldCheck size={14} className="text-blue-500" />
                                        인증 코드
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={6}
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value)}
                                        placeholder="000000"
                                        className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-gray-300 text-center font-bold tracking-[8px] text-lg"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setIsCodeSent(false)}
                                        className="text-[11px] text-gray-400 hover:text-blue-500 ml-1 transition-colors underline"
                                    >
                                        이메일 수정하기
                                    </button>
                                </div>
                            )}



                            {error && (
                                <div className="p-3 bg-red-50 text-red-500 text-xs rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-1">
                                    {error}
                                </div>
                            )}

                            {successMessage && !error && (
                                <div className="p-3 bg-green-50 text-green-600 text-xs rounded-xl border border-green-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                                    <CheckCircle2 size={14} />
                                    {successMessage}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all shadow-lg shadow-gray-900/20 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    isSignup
                                        ? (isCodeSent ? <UserPlus size={20} /> : <ChevronRight size={20} />)
                                        : <LogIn size={20} />
                                )}
                                {isSignup
                                    ? (isCodeSent ? '회원가입 완료' : '인증 코드 받기')
                                    : '로그인'}
                            </button>
                        </form>

                        {!isSignup && (
                            <>
                                <div className="relative py-6">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-gray-100"></div>
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-white px-2 text-gray-400 font-medium">또는</span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleGuestLogin}
                                    className="w-full flex items-center justify-center gap-3 py-4 border-2 border-gray-100 rounded-2xl hover:bg-gray-50 hover:border-gray-200 transition-all duration-200 group active:scale-[0.98]"
                                >
                                    <span className="font-semibold text-gray-700">게스트로 입장 (미리보기)</span>
                                </button>
                            </>
                        )}

                        <p className="mt-10 text-center text-sm text-gray-500">
                            {isSignup ? '이미 계정이 있으신가요?' : '계정이 없으신가요?'} {' '}
                            <button
                                onClick={() => {
                                    setIsSignup(!isSignup);
                                    setIsCodeSent(false);
                                    setError(null);
                                    setSuccessMessage(null);
                                }}
                                className="text-blue-600 font-bold hover:underline"
                            >
                                {isSignup ? '로그인하기' : '회원가입'}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
