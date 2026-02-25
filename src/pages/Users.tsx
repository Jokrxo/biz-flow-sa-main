import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { UserList } from "@/components/Users/UserList";
import SEO from "@/components/SEO";

const Users = () => {
  return (
    <>
      <SEO title="User Administration | Rigel Business" description="Manage system users and company assignments" />
      <DashboardLayout>
        <div className="space-y-6">
          <UserList />
        </div>
      </DashboardLayout>
    </>
  );
};

export default Users;
