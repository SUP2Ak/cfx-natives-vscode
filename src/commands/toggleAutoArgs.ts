import { commands, workspace, window } from "vscode";

const toggleAutoArgs = commands.registerCommand(
  "cfx-natives.toggleParentheses",
  () => {
    const config = workspace.getConfiguration("cfx-natives");
    const current = config.get("insertParentheses", false);
    config.update("insertParentheses", !current, true).then(() => {
        window.showInformationMessage(
        `Auto parentheses ${!current ? "enabled" : "disabled"}`,
      );
    });
  },
);

export default toggleAutoArgs;
