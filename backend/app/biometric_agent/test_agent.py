import os
import sys
import unittest

from biometric_agent.agent import (
    _last_report,
    get_model_id,
    report_verdict,
    trigger_heavy_metal_mode,
    trigger_system_error,
)


class TestBiometricAgent(unittest.TestCase):
    def setUp(self):
        # report_verdict's repeat window is module state, so tests would
        # otherwise see each other's calls -- and the second test to report a
        # dog would get the duplicate answer instead of the one it asserts on.
        _last_report.update(is_dog=None, at=0.0)

    def test_report_verdict(self):
        """Test that report_verdict returns the correct structure."""
        result = report_verdict(True, 94, "golden retriever")
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["is_dog"], True)
        self.assertEqual(result["subject"], "golden retriever")
        self.assertEqual(result["confidence"], 94)

    def test_repeating_a_verdict_tells_the_model_to_stop(self):
        """The tool result is the only channel that can interrupt a repeat run.

        The instruction is read once per session; the result is read every time,
        right where the model is deciding whether to call again. A second call
        with the same verdict therefore gets a different answer -- and one that
        names the thing to do instead, since "stop" alone leaves the scan with
        no confirmation spoken.
        """
        report_verdict(True, 90, "beagle")
        result = report_verdict(True, 90, "beagle")

        self.assertEqual(result["status"], "already_reported")
        self.assertEqual(result["is_dog"], True)
        self.assertIn("STOP calling report_verdict", result["message"])
        self.assertIn("confirmation", result["message"])

    def test_the_same_dog_described_twice_is_still_a_repeat(self):
        """Dedup is keyed on the verdict, not the subject string.

        The model describes one dog as "golden retriever" on the first call and
        "a dog, golden retriever" on the second. Those are the same answer
        arriving twice, and keying on the string would let the repeat through.
        """
        report_verdict(True, 90, "golden retriever")
        result = report_verdict(True, 88, "a dog, golden retriever")
        self.assertEqual(result["status"], "already_reported")

    def test_a_different_verdict_is_never_a_repeat(self):
        """Rule 5 of the instruction: every scan is independent.

        A subject that changes between scans must report both verdicts, so only
        the same verdict twice in the window is a repeat.
        """
        report_verdict(True, 90, "beagle")
        self.assertEqual(report_verdict(False, 80, "grey wolf")["status"], "success")
        self.assertEqual(report_verdict(True, 90, "beagle")["status"], "success")

    def test_trigger_system_error(self):
        """Test that trigger_system_error returns the correct error structure."""
        result = trigger_system_error()
        self.assertEqual(result["status"], "error")
        self.assertIn("Feline", result["message"])

    def test_trigger_heavy_metal_mode(self):
        """Test that the containment breach returns the correct success structure.

        The message is pinned to the announcement rule 4 asks the model to speak.
        A tool result is a suggestion about what to say next, and this one used
        to hand back the song line the same instruction forbids.
        """
        result = trigger_heavy_metal_mode()
        self.assertEqual(result["status"], "success")
        self.assertIn("Containment has failed", result["message"])
        self.assertNotIn("dogs are out", result["message"].lower())

    def test_get_model_id_default(self):
        """Falls back to a GA model when MODEL_ID is unset.

        Asserted as "not a preview id" rather than against a literal: the id
        this project actually runs on is not public and must never appear in the
        tree. See BUILD-LOG.md, task #11.
        """
        original_model = os.environ.get("MODEL_ID")
        if "MODEL_ID" in os.environ:
            del os.environ["MODEL_ID"]

        # We need to mock sys.argv to not include 'adk run'
        original_argv = sys.argv
        sys.argv = ["test_agent.py"]

        model_id = get_model_id()
        # The GA model that actually supports bidiGenerateContent. Plain
        # gemini-2.5-flash does not, which is what the first live run found.
        self.assertEqual(model_id, "gemini-2.5-flash-native-audio-latest")
        self.assertNotIn("preview", model_id)

        sys.argv = original_argv
        if original_model:
            os.environ["MODEL_ID"] = original_model

    def test_get_model_id_env(self):
        """Test that get_model_id respects the MODEL_ID environment variable."""
        original_model = os.environ.get("MODEL_ID")
        os.environ["MODEL_ID"] = "test-model"
        model_id = get_model_id()
        self.assertEqual(model_id, "test-model")

        if original_model:
            os.environ["MODEL_ID"] = original_model
        else:
            del os.environ["MODEL_ID"]


if __name__ == "__main__":
    unittest.main()
