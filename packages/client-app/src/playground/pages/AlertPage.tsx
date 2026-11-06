import Alert from "~/components/Alert/Alert";
import Example from "../Example";

export default function AlertPage() {
  return (
    <>
      <h2>Alert</h2>
      <Example title={"Severities"} layout={"column"}>
        <Alert severity={"info"}>No messages yet</Alert>
        <Alert severity={"warning"}>Invite expired</Alert>
        <Alert severity={"error"}>Connection to peer lost</Alert>
      </Example>
    </>
  );
}
