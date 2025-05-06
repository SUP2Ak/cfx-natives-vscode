import { Uri, workspace } from 'vscode';
import * as path from 'path';

export default async function moveFile(fileName: string, sourceUri: Uri, targetUri: Uri) {
    try {
        const sourceFile = Uri.joinPath(sourceUri, fileName);
        const targetFile = Uri.joinPath(targetUri, fileName);
        
        console.log('Copying file from:', sourceFile.fsPath);
        console.log('Copying file to:', targetFile.fsPath);
        
        await workspace.fs.copy(sourceFile, targetFile, { overwrite: true });
        console.log('File copied successfully');
    } catch (error) {
        console.error(`Erreur lors de la copie du fichier ${fileName}:`, error);
        throw error;
    }
}