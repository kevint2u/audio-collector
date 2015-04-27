#!/bin/bash

# Begin configuration section.
BASEDIR=/usr/users/dharwath/recognizers/wsj/s5
lang=$BASEDIR/data/lang
srcdir=$BASEDIR/exp/tri3b
tempdir=`mktemp -d`
nj=4
cmd=run.pl
# Begin configuration.
scale_opts="--transition-scale=1.0 --acoustic-scale=0.1 --self-loop-scale=0.1"
beam=10
retry_beam=40
boost_silence=1.0 # Factor by which to boost silence during alignment.
# End configuration options.

[ -f $BASEDIR/path.sh ] && . $BASEDIR/path.sh # source the path.
#. parse_options.sh || exit 1;

if [ $# != 3 ]; then
   echo "usage: align_si_one_utt.sh <wav-file> <text-file-in> <output-file>"
   echo "e.g.:  align_si_one_utt.sh test-in.wav words-in.txt test-out.txt"
   echo "Will write a 1 to <output-file> if successful, 0 otherwise"
   exit 1;
fi

infile=$1
intext=$2
outfile=$3

oov=`cat $lang/oov.int` || exit 1;
splice_opts=`cat $srcdir/splice_opts 2>/dev/null` # frame-splicing options.
norm_vars=`cat $srcdir/norm_vars 2>/dev/null` || norm_vars=false # cmn/cmvn option, default false.

if [ -f $srcdir/final.mat ]; then feat_type=lda; else feat_type=delta; fi

mfcc=$tempdir/mfcc.ark
cmvn=$tempdir/cmvn.ark
rm -f $tempdir/wav.scp
rm -f $mfcc
rm -f $cmvn
echo "UTT_ID " $infile > $tempdir/wav.scp
compute-mfcc-feats --config=$BASEDIR/conf/mfcc.conf scp:$tempdir/wav.scp ark:$mfcc
compute-cmvn-stats ark:$tempdir/mfcc.ark ark:$cmvn

case $feat_type in
  delta) feats="ark,s,cs:apply-cmvn --norm-vars=$norm_vars ark:$cmvn ark:$mfcc ark:- | add-deltas ark:- ark:- |";;
  lda) feats="ark,s,cs:apply-cmvn --norm-vars=$norm_vars ark:$cmvn ark:$mfcc ark:- | splice-feats $splice_opts ark:- ark:- | transform-feats $srcdir/final.mat ark:- ark:- |";;
  *) echo "$0: invalid feature type $feat_type" && exit 1;
esac

mdl="gmm-boost-silence --boost=$boost_silence `cat $lang/phones/optional_silence.csl` $srcdir/final.mdl - |"

text=$tempdir/text.txt
rm -f $text
echo "UTT_ID" `cat $intext` | tr '[:lower:]' '[:upper:]' > $text

tra="ark:$BASEDIR/utils/sym2int.pl --map-oov $oov -f 2- $lang/words.txt $text|";
compile-train-graphs $srcdir/tree $srcdir/final.mdl  $lang/L.fst "$tra" ark:- | \
  gmm-align-compiled $scale_opts --beam=$beam --retry-beam=$retry_beam "$mdl" ark:- \
    "$feats" "ark,t:|gzip -c >$tempdir/ali.gz" ark,t:$tempdir/scores.ark 2> $tempdir/log.txt;

successful=`grep 'Done 1' $tempdir/log.txt | wc | awk '{print $1}'`

echo $successful > $outfile

rm -f $tempdir/*
rmdir $tempdir