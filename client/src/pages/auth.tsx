import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";
import { authEvents } from "@/lib/gtm";

interface AuthPageProps {
  onAuthSuccess: (user: { id: string; email: string }) => void;
}

// Form validation schemas
const signupSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [, setLocation] = useLocation();
  // Default to signup if coming from landing page (check URL params)
  const urlParams = new URLSearchParams(window.location.search);
  const shouldSignup = urlParams.get('signup') === 'true' || urlParams.get('mode') === 'signup';
  const [isLogin, setIsLogin] = useState(!shouldSignup);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const signupForm = useForm<{ firstName: string; lastName: string; email: string; password: string }>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
    },
  });

  const loginForm = useForm<{ email: string; password: string }>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Track page view on mount
  useEffect(() => {
    authEvents.pageView(isLogin ? 'login' : 'signup');
  }, [isLogin]);

  const onSubmit = async (data: { firstName?: string; lastName?: string; email: string; password: string }) => {
    setIsLoading(true);
    try {
      if (isLogin) {
        // Login with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

        if (authError) {
          throw new Error(authError.message);
        }

        if (!authData.session) {
          throw new Error("No session created");
        }

        // Get or create user profile
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error("No session found");
        }

        const response = await fetch("/api/auth/create-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            firstName: data.firstName || "",
            lastName: data.lastName || "",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to create profile");
        }

        const result = await response.json();
        onAuthSuccess(result.user);
        
        // Track successful login
        authEvents.login(data.email);
        
        toast({
          title: "Welcome back!",
          description: "You've successfully logged in.",
        });
      } else {
        // Signup with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            data: {
              first_name: data.firstName,
              last_name: data.lastName,
            },
          },
        });

        if (authError) {
          throw new Error(authError.message);
        }

        // If no session is returned, try to sign in immediately (email confirmation disabled)
        let session = authData.session;
        if (!session) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password,
          });

          if (signInError) {
            throw new Error(signInError.message);
          }

          if (!signInData.session) {
            throw new Error("Failed to create session. Please try again.");
          }

          session = signInData.session;
        }

        // Create user profile
        const response = await fetch("/api/auth/create-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            firstName: data.firstName,
            lastName: data.lastName,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to create profile");
        }

        const result = await response.json();
        onAuthSuccess(result.user);
        
        // Track successful signup
        authEvents.signup(data.email);
        
        toast({
          title: "Account created!",
          description: "Your account has been created successfully.",
        });
      }
    } catch (error) {
      // Track auth error
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      authEvents.authError(errorMessage, isLogin ? 'login' : 'signup');
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back to home</span>
        </button>
        <div className="text-center">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-secondary via-primary to-white bg-clip-text text-transparent mb-4">Trends Search</h1>
          <p className="text-lg text-white/60">
            Discover trending opportunities with real market data
          </p>
        </div>

        <GlassmorphicCard className="p-8">
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-semibold text-white">
                {isLogin ? "Welcome back" : "Create account"}
              </h2>
              <p className="text-sm text-white/60">
                {isLogin
                  ? "Enter your credentials to continue"
                  : "Sign up to start discovering opportunities"}
              </p>
            </div>

            {isLogin ? (
              <form onSubmit={loginForm.handleSubmit((data) => onSubmit(data))} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/90">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    data-testid="input-email"
                    {...loginForm.register("email")}
                  />
                  {loginForm.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {loginForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white/90">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    data-testid="input-password"
                    {...loginForm.register("password")}
                  />
                  {loginForm.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {loginForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-submit"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Please wait...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={signupForm.handleSubmit((data) => onSubmit(data))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-white/90">
                      First Name
                    </Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="John"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      data-testid="input-firstName"
                      {...signupForm.register("firstName")}
                    />
                    {signupForm.formState.errors.firstName && (
                      <p className="text-sm text-destructive">
                        {signupForm.formState.errors.firstName.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-white/90">
                      Last Name
                    </Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder="Doe"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      data-testid="input-lastName"
                      {...signupForm.register("lastName")}
                    />
                    {signupForm.formState.errors.lastName && (
                      <p className="text-sm text-destructive">
                        {signupForm.formState.errors.lastName.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/90">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    data-testid="input-email"
                    {...signupForm.register("email")}
                  />
                  {signupForm.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {signupForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white/90">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    data-testid="input-password"
                    {...signupForm.register("password")}
                  />
                  {signupForm.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {signupForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-submit"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Please wait...
                    </>
                  ) : (
                    "Create account"
                  )}
                </Button>
              </form>
            )}

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  signupForm.reset();
                  loginForm.reset();
                }}
                className="text-sm text-primary hover:text-primary/80 transition-colors"
                data-testid="button-toggle-auth"
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </GlassmorphicCard>
      </div>
    </div>
  );
}
