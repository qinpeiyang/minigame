using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;

namespace GiantCleaner
{
    public class GameBootstrap : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            var root = new GameObject("GiantCleaner_Bootstrap");
            root.AddComponent<GameBootstrap>();
        }

        public void Start()
        {
            Application.targetFrameRate = 60;
            QualitySettings.antiAliasing = 4;

            var scene = new GameObject("Level_01_Bicycle_Cleaning");
            scene.AddComponent<Level01Bicycle>();
        }
    }
}
