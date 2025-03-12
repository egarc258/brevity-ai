// app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
    return (
        <div className="flex justify-center items-center min-h-screen bg-white">
            <div className="p-6 rounded-xl">
                <SignIn appearance={{
                    elements: {
                        rootBox: "mx-auto",
                        card: "bg-white rounded-xl shadow-md border border-gray-200",
                        headerTitle: "text-gray-800",
                        headerSubtitle: "text-gray-600",
                        formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white rounded-full",
                        formFieldLabel: "text-gray-700",
                        formFieldInput: "border-gray-300 focus:border-blue-500 focus:ring-blue-500 bg-white rounded-lg",
                        footerActionLink: "text-blue-600 hover:text-blue-700",
                        dividerLine: "bg-gray-300",
                        dividerText: "text-gray-600",
                        identityPreviewText: "text-gray-800",
                        identityPreviewEditButton: "text-blue-600 hover:text-blue-700",
                    }
                }} />
            </div>
        </div>
    );
}