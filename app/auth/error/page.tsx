import Link from "next/link";
export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
}) {
  const params = await searchParams;
  const error = params.error;
  const message = params.message;
  const errorMessages: Record<string, string> = {
    Configuration: "There is a problem with the server configuration.",
    AccessDenied: "You do not have permission to sign in.",
    Verification: "The verification link may have expired.",
    OAuthSignin: "Error constructing an authorization URL.",
    OAuthCallback: "Error handling the callback from the OAuth provider.",
    OAuthCreateAccount: "Could not create an OAuth account.",
    EmailCreateAccount: "Could not create email account.",
    Callback: "Error in the OAuth callback handler.",
    OAuthAccountNotLinked: "Email already associated with another account.",
    EmailSignin: "Check your email address.",
    CredentialsSignin: "Sign in failed. Check your credentials.",
    SessionRequired: "Please sign in to access this page.",
    default: "An unexpected error occurred.",
    no_code: "No authorization code received from Hack Club.",
    auth_failed: "Authentication failed. Please try again.",
  };
  const errorMessage = error
    ? errorMessages[error] || errorMessages.default
    : errorMessages.default;
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="max-w-md w-full space-y-8 p-8 bg-zinc-900 rounded-lg shadow-xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Authentication Error
          </h2>
          <div className="mt-4 p-4 bg-red-900/20 border border-red-800 rounded-lg">
            <p className="text-center text-sm text-red-400">{errorMessage}</p>
            {message && (
              <p className="mt-2 text-center text-xs text-red-600">
                {(() => {
                  try {
                    return decodeURIComponent(message);
                  } catch {
                    return message;
                  }
                })()}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <Link
            href="/auth/signin"
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 transition-colors"
          >
            Try Again
          </Link>
          <Link
            href="/"
            className="w-full flex justify-center py-3 px-4 border border-zinc-700 rounded-lg shadow-sm text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 transition-colors"
          >
            Go Home
          </Link>
        </div>

        <div className="mt-6">
          <p className="text-center text-xs text-zinc-500">
            If the problem persists, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
}
