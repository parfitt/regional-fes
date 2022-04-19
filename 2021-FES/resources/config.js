// Define a new instance of the FES
var fes

S(document).ready(function(){

	fes = new FES({
		// Some basic default options
		"options": {
			"scenario": "Leading the Way",
			"view": "NUTS",
			"key": (new Date()).getFullYear()+'',
			"parameter": "demandpk-all",
			"scale": "relative",
			"years": {"min":2020, "max":2050},
			"map": {
				"bounds": [[49.8273,-6.4874],[59.4227,1.9336]]
			}
		},
		// How we map from our source data's IDs to a particular geography
		"mapping": {
			"gsp": {
				// Mapping from GSPs for the NUTS 1 layer
				"NUTSlayer": { 
					"file": "data/gridsupplypoints2nuts1.json"
				},
				// No mapping needed for GSPs
				"GSPlayer": { }
			}
		},
		// Define our layers so that they can be used in the views
		"layers": {
			"NUTSlayer":{
				"geojson": "data/maps/nuts1_BUC_4326.geojson",	// The GeoJSON file with the NUTS 1 features
				"key": "nuts118nm"	// The key used in the properties of the GeoJSON feature
			},
			"GSPlayer":{
				"geojson":"data/maps/gridsupplypoints-unique-all.geojson",	// The GeoJSON file with the non-overlapping GSP features
				"key": "GSP"	// The key used in the properties of the GeoJSON feature
			}
		},
		// Define our map views
		"views":{
			"NUTS":{
				"title":"NUTS1 Regions",
				"source": "gsp",
				"layers":[{
					"id": "NUTSlayer",
					"heatmap": true,
					"boundary":{"strokeWidth":2}
				}],
				"popup": {
					"text": function(attr){
						var popup,title,dp,value;
						popup = '<h3>%TITLE%</h3><p>%VALUE%</p><div id="barchart"></div><p style="font-size:0.8em;margin-top: 0.25em;margin-bottom:0;text-align:center;">Grid supply points (ordered)</p><p style="font-size:0.8em;margin-top:0.5em;">Columns show totals for each grid supply point associated with %TITLE%. The coloured portions show the fraction considered to be in %TITLE%. Hover over each to see details.</p>';
						title = (attr.properties.nuts118nm||'?');
						dp = (typeof attr.parameter.dp==="number" ? attr.parameter.dp : 2);
						value = '<strong>'+attr.parameter.title+' '+this.options.key+':</strong> '+(typeof attr.value==="number" ? (dp==0 ? Math.round(attr.value) : attr.value.toFixed(dp)).toLocaleString()+''+(attr.parameter.units ? '&thinsp;'+attr.parameter.units : '') : '');
						return popup.replace(/\%VALUE\%/g,value).replace(/\%TITLE\%/g,title); // Replace values
					},
					"open": function(attr){

						if(!attr) attr = {};
						
						l = this.views[this.options.view].layers[0].id;
						key = this.layers[l].key;

						if(attr.id){

							var data = [];
							var balloons = [];
							var raw = this.data.scenarios[this.options.scenario].data[this.options.parameter].raw;
							
							// Work out the NUTS1 region name
							var nuts118nm = attr.id;
							if(this.layers.NUTSlayer){
								for(var c = 0; c < this.layers.NUTSlayer.geojson.features.length; c++){
									if(this.layers.NUTSlayer.geojson.features[c].properties.ctry19cd==attr.id) nuts118nm = this.layers.NUTSlayer.geojson.features[c].properties.nuts118nm;
								}
							}

							// Find the column for the year
							var yy = -1;
							for(var i = 0; i < raw.fields.title.length; i++){
								if(raw.fields.title[i]==this.options.key) yy = i;
							}
							if(yy < 0) return;
							
							for(var p in this.mapping.gsp.NUTSlayer.data){
								if(this.mapping.gsp.NUTSlayer.data[p][attr.id]){
									v = 0;
									for(var i = 0; i < raw.rows.length; i++){
										if(raw.rows[i][0]==p) v = raw.rows[i][yy];
									}

									frac = this.mapping.gsp.NUTSlayer.data[p][attr.id]*v;
									fracOther = v - frac;
									data.push([p,[v,p+'<br />Total: %VALUE%<br />'+(this.mapping.gsp.NUTSlayer.data[p][attr.id]*100).toFixed(2).replace(/\.?0+$/,"")+'% is in '+nuts118nm,frac,fracOther]]);
								}
							}

							data.sort(function(a, b) {
								if(a[1][0]===b[1][0]) return 0;
								else return (a[1][0] < b[1][0]) ? -1 : 1;
							}).reverse();

							// Remove totals from bars now that we've sorted by total
							for(var i = 0; i < data.length; i++){
								balloons.push(data[i][1].splice(0,2));
							}
							
							// Create the barchart object. We'll add a function to
							// customise the class of the bar depending on the key.
							var chart = new S.barchart('#barchart',{
								'formatKey': function(key){
									return '';
								},
								'formatBar': function(key,val,series){
									var cls = (typeof series==="number" ? "series-"+series : "");
									for(var i = 0; i < this.data.length; i++){
										if(this.data[i][0]==key){
											if(i > this.data.length/2) cls += " bar-right";
										}
									}
									return cls;
								}
							});

							// Send the data array and bin size then draw the chart
							chart.setData(data).setBins({ 'mintick': 5 }).draw();
							parameter = this.parameters[this.options.parameter].title+' '+this.options.key;
							units = this.parameters[this.options.parameter].units;
							dp = this.parameters[this.options.parameter].dp;

							// Add an event
							chart.on('barover',function(e){
								S('.balloon').remove();
								var b = balloons[e.bin];
								S(e.event.currentTarget).find('.bar.series-1').append(
									"<div class=\"balloon\">"+b[1].replace(/%VALUE%/,parseFloat((b[0]).toFixed(dp)).toLocaleString()+(units ? '&thinsp;'+units:''))+"</div>"
								);
							});
							S('.barchart table .bar').css({'background-color':'#cccccc'});
							S('.barchart table .bar.series-0').css({'background-color':this.data.scenarios[this.options.scenario].color});
						}else{
							S(attr.el).find('#barchart').remove();
						}
					}
				}
			},
			"gridsupplypoints":{
				"title":"Grid Supply Points",
				"file":"data/maps/gridsupplypoints-unique-all.geojson",
				"source": "gsp",
				"layers":[{
					"id": "PRIMARYlayer",
					"heatmap": true,
				}],
				"popup": {
					"text": function(attr){
						var popup,title,dp,value;
						popup = '<h3>%TITLE%</h3><p>%VALUE%</p>';
						title = (attr.properties.GSP||'?');
						dp = (typeof attr.parameter.dp==="number" ? attr.parameter.dp : 2);
						value = '<strong>'+attr.parameter.title+' '+this.options.key+':</strong> '+(typeof attr.value==="number" ? (dp==0 ? Math.round(attr.value) : attr.value.toFixed(dp)).toLocaleString()+''+(attr.parameter.units ? '&thinsp;'+attr.parameter.units : '') : '?');
						return popup.replace(/\%VALUE\%/g,value).replace(/\%TITLE\%/g,title); // Replace values
					}
				}
			}
		},
		"on": {
			"buildMap": function(){
				var el,div,_obj;
				el = document.querySelector('.leaflet-top.leaflet-left');
				if(el){
					// Does the place search exist?
					if(!el.querySelector('.placesearch')){
						div = document.createElement('div');
						div.classList.add('leaflet-control');
						div.classList.add('leaflet-bar');
						div.innerHTML = '<div class="placesearch"><div class="submit" href="#" title="Search" role="button" aria-label="Search"></div><form class="placeform layersearch pop-left" action="search" method="GET" autocomplete="off"><input class="place" id="search" name="place" value="" placeholder="Search for a named area" type="text" /><div class="searchresults" id="searchresults"></div></div></form>';
						el.appendChild(div);
						
						function toggleActive(state){
							e = el.querySelector('.placesearch');
							if(typeof state!=="boolean") state = !e.classList.contains('typing');
							if(state){
								e.classList.add('typing');
								e.querySelector('input.place').focus();
							}else{
								e.classList.remove('typing');
							}
						}
					
						div.querySelector('.submit').addEventListener('click', function(e){ toggleActive(); });

						_obj = this;
						
						// Stop map dragging on the element
						el.addEventListener('mousedown', function(){ _obj.map.dragging.disable(); });
						el.addEventListener('mouseup', function(){ _obj.map.dragging.enable(); });

						// Define a function for scoring how well a string matches
						function getScore(str1,str2,v1,v2,v3){
							var r = 0;
							str1 = str1.toUpperCase();
							str2 = str2.toUpperCase();
							if(str1.indexOf(str2)==0) r += (v1||3);
							if(str1.indexOf(str2)>0) r += (v2||1);
							if(str1==str2) r += (v3||4);
							return r;
						}
						this.search = TypeAhead.init('#search',{
							'items': [],
							'render': function(d){
								// Construct the label shown in the drop down list
								return d['name']+(d['type'] ? ' ('+d['type']+')':'');
							},
							'rank': function(d,str){
								// Calculate the weight to add to this airport
								var r = 0;
								if(d['name']) r += getScore(d['name'],str);
								if(d['id']) r += getScore(d['name'],str);
								return r;
							},
							'process': function(d){
								// Format the result
								var l,ly,key,i;
								l = d['layer'];
								ly = _obj.layers[l].layer;
								key = _obj.layers[l].key;
								for(i in ly._layers){
									if(ly._layers[i].feature.properties[key]==d['id']){

										// Zoom to feature
										_obj.map.fitBounds(ly._layers[i]._bounds,{'padding':[5,5]});

										// Open the popup for this feature
										ly.getLayer(i).openPopup();
										
										// Change active state
										toggleActive(false);
									}
								}
							}
						});
					}
					if(this.search){
						var l,f,i,j;
						this.search._added = {};
						this.search.clearItems();
						//console.log(this,this.options.view,this.layers[this.options.view]);
						for(j = 0; j < this.views[this.options.view].layers.length; j++){
							l = this.views[this.options.view].layers[j].id;
							key = "";
							if(l=="NUTSlayer") key = "nuts118nm";
							else if(l=="GSPlayer") key = "GSP";
							if(this.layers[l].geojson && this.layers[l].geojson.features && this.layers[l].key && key){
								// If we haven't already processed this layer we do so now
								if(!this.search._added[l]){
									//console.log('adding',l);
									f = this.layers[l].geojson.features;
									for(i = 0; i < f.length; i++) this.search.addItems({'name':f[i].properties[key]||"?",'id':f[i].properties[this.layers[l].key]||"",'i':i,'layer':l});
									this.search._added[l] = true;
								}
							}
						}
					}
				}
			}
		}
	});
});
