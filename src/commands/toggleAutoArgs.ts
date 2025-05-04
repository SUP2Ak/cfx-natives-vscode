import { commands, workspace, window } from "vscode";

const toggleAutoArgs = commands.registerCommand(
  "cfxNatives.toggleParentheses",
  () => {
    const config = workspace.getConfiguration("cfxNatives");
    const current = config.get("insertParentheses", false);
    config.update("insertParentheses", !current, true).then(() => {
        window.showInformationMessage(
        `Auto parentheses ${!current ? "enabled" : "disabled"}`,
      );
    });
  },
);

export default toggleAutoArgs;
