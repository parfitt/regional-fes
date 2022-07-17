#!/usr/bin/perl

use warnings;
use utf8;
use Cwd qw(abs_path);
use Data::Dumper;
use Text::CSV;
use JSON::XS;
use open qw( :std :encoding(UTF-8) );

# Get the real base directory for this script
my $basedir = "./";
if(abs_path($0) =~ /^(.*\/)[^\/]*/){ $basedir = $1; }

print "Processing FES data\n";
print "===================\n";


$cache = 1;
if(@ARGV && $ARGV[0] eq "download"){ $cache = 0; }


$workdir = $basedir."temp/";
if(!-d $workdir){
	`mkdir $workdir`;
}


# https://data.nationalgrideso.com/future-energy-scenarios/future-energy-scenario-fes-building-block-data
# https://data.nationalgrideso.com/future-energy-scenarios/regional-breakdown-of-fes-data-electricity/r/grid_supply_point_info
$csvs = {
	"bb-defs"=>{
		"url"=>"",
		"file"=>$workdir."building_block_definitions.csv"
	},
	"bb"=>{
		"url"=>"",
		"file"=>$workdir."building_block_data.csv"
	},
	"gsp"=>{
		"url"=>"https://data.nationalgrideso.com/backend/dataset/963525d6-5d83-4448-a99c-663f1c76330a/resource/41fb4ca1-7b59-4fce-b480-b46682f346c9/download/fes2021_regional_breakdown_gsp_info.csv",
		"file"=>$workdir."gsp_info.csv"
	}
};

# Get an update of the package file from the ESO data portal
$file = $workdir."datapackage.json";
$url = "https://data.nationalgrideso.com/future-energy-scenarios/future-energy-scenario-fes-building-block-data/datapackage.json";
print "Getting package from $url\n";
`curl -L -s $url > $file`;
$json = loadJSON($file);
# Go through resources from the most recent and find URLs of CSV files
$n = @{$json->{'resources'}};
for($i = $n-1; $i >= 0; $i--){
	if($json->{'resources'}[$i]{'format'} eq "csv"){
		if($json->{'resources'}[$i]{'name'} =~ /building_block_definitions/ && !$csvs->{'bb-defs'}{'url'}){
			$csvs->{'bb-defs'}{'url'} = $json->{'resources'}[$i]{'path'};
		}elsif($json->{'resources'}[$i]{'name'} =~ /building_blocks/ && !$csvs->{'bb'}{'url'}){
			$csvs->{'bb'}{'url'} = $json->{'resources'}[$i]{'path'};
		}
	}
}


# Download data
for $key (sort(keys(%{$csvs}))){
	$file = $csvs->{$key}{'file'};
	if(!$cache || !-e $csvs->{$key}{'file'} || -s $csvs->{$key}{'file'} == 0){
		print "Downloading CSV from $csvs->{$key}{'url'}\n";
		`wget -q --no-check-certificate -O $csvs->{$key}{'file'} "$csvs->{$key}{'url'}"`;
	}
}

###########
# GSPs
%gsps = getCSV($csvs->{'gsp'}{'file'},{
	'id'=>'GSP ID'
});
# Double check GSPs for duplicate names
%gspnames = ();
for $gsp (sort(keys(%gsps))){
	if($gspnames{$gsps{$gsp}{'Name'}}){
		print "WARNING: Ambiguity for GSP name \"$gsps{$gsp}{'Name'}\" - assigned to $gsp and $gspnames{$gsps{$gsp}{'Name'}}.\n";
		$gsps{$gsp}{'ambiguous'} = 1;
		$gsps{$gspnames{$gsps{$gsp}{'Name'}}}{'ambiguous'} = 1;
	}
	$gspnames{$gsps{$gsp}{'Name'}} = $gsp;
}


##################
# Building Blocks

$parameters = loadJSON($basedir.'scenarios/parameters-building-blocks.json');

# STEP 1 - process the building block definitions
%bbdef = getCSV($csvs->{'bb-defs'}{'file'},{
	'id'=>'BBID',
	'headerline'=>1,
	'map'=>{
		'Building Block ID Number'=>'BBID'
	},
	'fillinblanks'=>{
		'Template'=>1,
		'Technology'=>1
	},
	'zapleadingspaces'=>{
		'Units'=>1
	},
	'zaptrailingspaces'=>{
		'Template'=>1,
		'Units'=>1
	}
});
for $id (sort(keys(%bbdef))){
	$name = "";
	if($bbdef{$id}{'Template'} eq "Generation"){
		$name = $bbdef{$id}{'Technology'}.": ".$bbdef{$id}{'Technology Detail'}." (".$bbdef{$id}{'Units'}.") ".$bbdef{$id}{'Detail'};
	}elsif($bbdef{$id}{'Template'} eq "Demand"){
		#$name = $bbdef{$id}{'Template'}.": ".$bbdef{$id}{'Technology Detail'}." (".$bbdef{$id}{'Units'}.") ".$bbdef{$id}{'Detail'};
		$name = $bbdef{$id}{'Technology Detail'}." (".$bbdef{$id}{'Units'}.") ".$bbdef{$id}{'Detail'};
	}elsif($bbdef{$id}{'Template'} eq "Demand Low Carbon Technologies"){
		$name = $bbdef{$id}{'Technology'}.": ".$bbdef{$id}{'Technology Detail'}." (".$bbdef{$id}{'Units'}.")";#." ".$bbdef{$id}{'Detail'};
	}elsif($bbdef{$id}{'Template'} eq "Storage & Flexibility"){
		$name = $bbdef{$id}{'Technology'}.": ".$bbdef{$id}{'Technology Detail'}." (".$bbdef{$id}{'Units'}.") ".$bbdef{$id}{'Detail'};
	}
	$desc = $bbdef{$id}{'Detail'};
	if($bbdef{$id}{'Comments'}){ $desc .= "\n".$bbdef{$id}{'Comments'}; }
	if($bbdef{$id}{'ESO Comments'}){ $desc .= "\n".$bbdef{$id}{'ESO Comments'}; }
	$desc =~ s/\n/<br \/>/g;
	$match = -1;
	for($i = 0; $i < @{$parameters}; $i++){
		if($parameters->[$i]{'key'} && $parameters->[$i]{'key'} eq $id){
			$match = $i;
		}
	}
	if($match >= 0){
		# Exists in config already so update
		$parameters->[$match]{"title"} = $name;
		$parameters->[$match]{"optgroup"} = $bbdef{$id}{'Template'};
	}else{
		# Create a new entry
		print "Add new $id\n";
		push(@{$parameters},{"key"=> $id, "title"=>$name, "optgroup"=> $bbdef{$id}{'Template'}, "combine"=>"sum", "dp"=>1, "description"=>$desc});
		$match = @{$parameters} - 1;
	}

	if($bbdef{$id}{'ESO Comments'} =~ /Not included/i || $bbdef{$id}{'ESO Comments'} =~ /We are unable to redistribute this data/){
		print "WARNING: Excluding $id because the ESO Comments say it isn't there.\n";
		splice(@{$parameters},$match,1);
	}


}
$file = $basedir.'scenarios/parameters-building-blocks.json';
saveJSON($file,$parameters,{'postprocess'=>\&cleanParameters,'name'=>'parameters configuration'});
print "NOTE: You should check if this looks sensible. If this code has generated new parameters from the data you should make sure that the 'combine' method for each is set correctly to either \"max\" or \"sum\".\n";

if(!-d $workdir."building-blocks/"){
	$dir = $workdir."building-blocks/";
	`mkdir $dir`;
}
# STEP 2 - process building block data
opendir($dh,$workdir."building-blocks/");
while(($filename = readdir($dh))){
	if($filename =~ /.*building-block.*csv$/){
		$file = $workdir."building-blocks/".$filename;
		`rm $file`;
	}
}
closedir($dh);
print "Reading $file\n";
@rows = getCSV($csvs->{'bb'}{'file'},{
	'map'=>{
		'Building Block ID Number'=>'BBID'
	}
});
$ystart = 2020;
$yend = 2050;

my %data;
for($i = 0; $i < @rows; $i++){
	$scenario = $rows[$i]{'FES Scenario'};
	$scenario =~ s/[a-z\s]//g;
	$scenario = substr($scenario,0,2);
	$bb = $rows[$i]{'BBID'};

	if(!$data{$scenario}){
		$data{$scenario} = {};
	}
	if(!$data{$scenario}{$bb}){
		$data{$scenario}{$bb} = {};
	}
	$id = $gspnames{$rows[$i]{'GSP'}};
	if(!$id){
		print "WARNING: In $scenario/$bb No ID for \"$rows[$i]{'GSP'}\"\n";
		$id = $rows[$i]{'GSP'};
		$gspnames{$rows[$i]{'GSP'}} = $rows[$i]{'GSP'};
	}
	if($data{$scenario}{$bb}{$id}){
		print "WARNING: In $scenario/$bb Already got \"$id\"\n";
	}else{
		$data{$scenario}{$bb}{$id} = "";
		for($yy = $ystart; $yy <= $yend; $yy++){
			$data{$scenario}{$bb}{$id} .= ",".($rows[$i]{$yy}||"");
		}
	}
}

# Load in the existing building blocks scenarios
$scenarios = loadJSON($basedir.'scenarios/index-building-blocks.json');
%scenariolookup;

for($s = 0; $s < @{$scenarios} ; $s++){
	$scode = $scenarios->[$s]{'key'};
	$scode =~ s/([A-Za-z])[a-z]+(\s|$)/$1/g;
	$scode = uc(substr($scode,0,2));
	$scenariolookup{$scenarios->[$s]{'key'}} = $scode;
	for($i = 0; $i < @{$parameters}; $i++){
		if($parameters->[$i]{'key'}){
			if(!$data{$scode}{$parameters->[$i]{'key'}}){
				print "WARNING: No building block data seems to exist for $scode $parameters->[$i]{'key'}\n";
			}
		}
	}
}

for $scenario (sort(keys(%data))){
	for $bb (sort(keys(%{$data{$scenario}}))){
		$file = $workdir."building-blocks/$scenario-building-block-$bb.csv";
		open($fh,">",$file);
		print $fh "GSP";
		for($yy = $ystart; $yy <= $yend; $yy++){
			print $fh ",$yy";
		}
		print $fh "\n";
		# We could either print the data we have or create placeholder data
		for $gsp (sort(keys(%{$data{$scenario}{$bb}}))){
			print $fh $gsp."$data{$scenario}{$bb}{$gsp}\n";
		}
		close($fh);
	}

	print "Scenario: $scenario\n";
	for($s = 0; $s < @{$scenarios} ; $s++){
		$scode = $scenarios->[$s]{'key'};
		if($scenariolookup{$scode} eq $scenario){
			print "\tUpdating $scode data\n";
			$scenarios->[$s]{'data'} = {};
			for $bb (sort(keys(%{$data{$scenario}}))){
				#"demandpk-all" : {"dataBy" : "gsp","file" : "gridsupplypoints/SP-DemandPk-All.csv","key" : "Primary"},
				$scenarios->[$s]{'data'}{$bb} = {"dataBy"=>"gsp","file"=>"gridsupplypoints/building-blocks/$scenario-building-block-$bb.csv","key"=>"GSP"};
			}
		}
	}
}

$file = $basedir.'scenarios/index-building-blocks.json';
saveJSON($file,$scenarios,{'postprocess'=>\&cleanScenarios,'name'=>'scenarios configuration'});











##########################
# SUBROUTINES

sub getCSV {
	my (@lines,@header,%datum,$c,$i,$id,@data,%dat,$startline,$line,@cols,$row,%prev);
	my ($file, $props) = @_;

	$line = 0;
	$startline = $props->{'headerline'}||0;
	$id = -1;

	my $csv = Text::CSV->new ({ binary => 1 });

	# Open the file
	open(my $fh,$file);
	while($row = $csv->getline($fh)){
		@cols = @$row;
		if($line == $startline){
			# Remove BOM
			$cols[0] =~ s/^\x{FEFF}//;
			for($i = 0; $i < @cols; $i++){
				# Only keep the header if it exists
				$header[$i] = $cols[$i];
			}
			# Map headers and find ID column
			for($c = 0; $c < @header; $c++){
				$header[$c] =~ s/(^\"|\"$)//g;
				if($props->{'map'} && $props->{'map'}{$header[$c]}){
					$header[$c] = $props->{'map'}{$header[$c]};
				}
				if($props->{'id'} && $header[$c] eq $props->{'id'}){
					$id = $c;
				}
			}
		}elsif($line > $startline){
			if(@header > 0){
				undef %datum;
				for($c = 0; $c < @cols; $c++){
					$cols[$c] =~ s/\’/\'/g;
					if($cols[$c] =~ /^" ?([0-9\,]+) ?"$/){
						$cols[$c] =~ s/(^" ?| ?"$)//g;
						$cols[$c] =~ s/\,//g;
					}
					$cols[$c] =~ s/(^\"|\"$)//g;
					if($props->{'zaptrailingspaces'}{$header[$c]}){
						$cols[$c] =~ s/\s$//g;
					}
					if($props->{'zapleadingspaces'}{$header[$c]}){
						$cols[$c] =~ s/^ //g;
					}

					if(!$cols[$c] && $props->{'fillinblanks'}{$header[$c]}){
						# Use a previously set value if we are filling in the blanks for this column
						$cols[$c] = $prev{$header[$c]};
					}
					if($header[$c] ne ""){
						$datum{$header[$c]} = $cols[$c];
					}
					if($cols[$c]){
						$prev{$header[$c]} = $cols[$c];
					}
				}
				if($id >= 0){
					$dat{$cols[$id]} = {%datum};
				}else{
					push(@data,{%datum});
				}
			}
		}
		$line++;
	}
	close(FILE);

	if($id >= 0){ return %dat; }
	else{ return @data; }
}


sub loadJSON {
	my ($file) = $_[0];
	my (@lines,$json,$str);

	open(FILE,$file);
	@lines = <FILE>;
	close(FILE);
	
	$str = join("",@lines);

	eval { $json = JSON::XS->new->decode($str); return $json; }
	or do { return {}; };
}


sub saveJSON {
	my $file = shift @_;
	my $jsondata = shift @_;
	my $conf = shift @_;
	my ($key,$str);

	$str = JSON::XS->new->utf8->allow_nonref(0)->relaxed(1)->pretty->canonical->encode($jsondata);
	
	# Use tabs instead of spaces for starts of lines
	$str =~ s/   /\t/g;

	# Fix boolean values
	$str =~ s/ : \"(true|false)\"/ : $1/g;


	if($conf->{'postprocess'}){
		$str = $conf->{'postprocess'}->($str);
	}

	# Save the event file
	print "Saving ".($conf->{'name'} || "JSON")." to $file\n";
	open(FILE,">",$file);
	print FILE $str;
	close(FILE);
	return;
}

sub cleanScenarios {
	my $str = $_[0];
	$str =~ s/" : /": /g;
	# Tidy up data variables which are 4 deep
	$str =~ s/\n\t{4}//g;
	$str =~ s/\n\t{3}\}/\}/g;
	$str =~ s/\n/===NEWLINE===/g;
	$str =~ s/("color":.*?)\,===NEWLINE===\t\t("key": "[^\"]+")/$2\,\n\t\t$1/g;
	$str =~ s/===NEWLINE===/\n/g;
	$str =~ s/\},\n\t\{/\},\{/g;
	return $str;
}
sub cleanParameters {
	my $str = $_[0];
	$str =~ s/" : /": /g;
	$str =~ s/\n\t\t//g;
	$str =~ s/\n\t\}/\}/g;
	$str =~ s/(\t\{)(.*)\,("key": ?"[^\"]+","optgroup": ?"[^\"]+","title": ?"[^\"]+")/$1$3,$2/g;
	return $str;
}