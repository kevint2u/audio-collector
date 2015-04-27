Try running this script:
./align_si_one_utt.sh utterance_4.wav utterance_4.txt ./output_should_work.txt

This should write a "1" to output_should_work.txt

Now, try running a wav file of the same length but containing nothing but silence:
./align_si_one_utt.sh silence.wav utterance_4.txt ./output_should_fail.txt

This should write a "0" to output_should_fail.txt

To view the usage of the verification script, try running it with no arguments:
./align_si_one_utt.sh
