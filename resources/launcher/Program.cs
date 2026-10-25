using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        var dir = AppDomain.CurrentDomain.BaseDirectory;
        var core = Path.Combine(dir, "EbookViewerCore.exe");
        if (!File.Exists(core))
        {
            MessageBox.Show("找不到 EbookViewerCore.exe，请重新解压完整的程序目录。", "Ebook Viewer");
            return;
        }

        try
        {
            var start = new ProcessStartInfo(core)
            {
                WorkingDirectory = dir,
                UseShellExecute = false,
                Arguments = "--no-sandbox"
            };
            // Some terminals (including this workspace's shell) export this;
            // inheriting it would make Electron run as plain Node and exit.
            start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Process.Start(start);
        }
        catch (Exception error)
        {
            MessageBox.Show("无法启动 Ebook Viewer：\r\n" + error.Message, "Ebook Viewer");
        }
    }
}
