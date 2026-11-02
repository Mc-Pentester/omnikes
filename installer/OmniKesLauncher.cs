using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal static class OmniKesLauncher
{
    [STAThread]
    private static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string script = Path.Combine(root, "installer", "OmniKesLauncher.cmd");
        string log = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OmniKes", "logs", "launcher-" + DateTime.Now.ToString("yyyyMMdd") + ".log");
        try
        {
            if (!File.Exists(script))
                throw new FileNotFoundException("Le lanceur interne OmniKes est introuvable. Réinstallez l'application.", script);

            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
            start.Arguments = "/d /s /c \"" + script + "\"";
            start.WorkingDirectory = root;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(start);

            DateTime deadline = DateTime.UtcNow.AddSeconds(75);
            while (DateTime.UtcNow < deadline)
            {
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3000/api/health");
                    request.Timeout = 1500;
                    request.Proxy = null;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    {
                        if ((int)response.StatusCode == 200) return;
                    }
                }
                catch { }
                Thread.Sleep(1000);
            }

            MessageBox.Show("OmniKes n'a pas pu démarrer. Vérifiez le service PostgreSQL Windows et consultez le journal :\r\n" + log,
                "Démarrage d'OmniKes", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Impossible de lancer OmniKes :\r\n" + ex.Message + "\r\n\r\nJournal : " + log,
                "Démarrage d'OmniKes", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
