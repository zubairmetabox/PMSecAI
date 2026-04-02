import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db, developerProfiles, eq } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminPage() {
  const { userId } = await auth.protect();

  // Only admins can access
  const [myProfile] = await db
    .select({ role: developerProfiles.role })
    .from(developerProfiles)
    .where(eq(developerProfiles.clerkUserId, userId!));

  if (myProfile?.role !== "admin") {
    redirect("/");
  }

  const allProfiles = await db
    .select()
    .from(developerProfiles)
    .orderBy(developerProfiles.createdAt);

  return (
    <div className="flex flex-col">
      <Header
        title="Admin"
        description="User management — invite new team members via the Clerk Dashboard"
      />
      <div className="p-6 space-y-6">
        {/* Invite instructions */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">How to invite team members</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>1. Go to your Clerk Dashboard → Users → Invite</p>
            <p>2. Enter the team member&apos;s email address</p>
            <p>3. They receive an invitation email to create their account</p>
            <p>4. Their developer profile is created automatically via the Clerk webhook</p>
            <p>5. Ask them to run the MCP server setup script and configure their Zoho identity</p>
          </CardContent>
        </Card>

        {/* Developer profiles table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Developer Profiles ({allProfiles.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left pb-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left pb-3 font-medium text-muted-foreground">VS Code Identity</th>
                  <th className="text-left pb-3 font-medium text-muted-foreground">Model</th>
                  <th className="text-left pb-3 font-medium text-muted-foreground">Role</th>
                </tr>
              </thead>
              <tbody>
                {allProfiles.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{p.name}</td>
                    <td className="py-3 text-muted-foreground">{p.email}</td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">{p.vsCodeIdentity}</td>
                    <td className="py-3">
                      {p.claudeModel && (
                        <Badge variant="outline" className="text-xs font-mono">
                          {p.claudeModel}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3">
                      <Badge variant={p.role === "admin" ? "default" : "secondary"}>
                        {p.role}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
