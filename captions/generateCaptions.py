from xml.etree.ElementTree import Element, SubElement, Comment
from xml.etree import ElementTree
from xml.dom import minidom
import xml.etree.cElementTree as ET
import os

def prettify(elem):
    """ Return a pretty-printed XML string for the Element """
    rough_string = ElementTree.tostring(elem, 'utf-8')
    reparsed = minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent="  ")


def createXML(image_id, image_captions):
    ''' Create XML file with captions for a specific id ''' 
    readable = Element('readable')

    title = SubElement(readable, 'title')
    title.text = image_id

    content = SubElement(readable, 'content')
    content.text = image_captions
    
    # print '\n', prettify(readable) # Uncomment to display XML
    filename = image_id + '.xml'
    tree = ET.ElementTree(readable)
    tree.write(filename)

def parseId(set):
    return set[0].split('.jpg')[0]
    
def parseCaption(item):
    return item.split('\t')[1]
        
def generateCaptions():
    ''' Run Program '''

    # read captions from text files
    print 'Preparing files'
    file_captions = open('raw/Flickr8k.token.txt','r')
    
    lines = file_captions.readlines()
    counter = 0
    curr_set = []
    caption_sets = []
    image_ids = []

    # parse lines into sets
    for line in lines:
        if counter % 5 == 0 and counter != 0:
            caption_sets.append(curr_set)
            curr_set = []
        curr_set.append(lines[counter])
        counter += 1

    # parse text from sets
    print 'Generating XML files'
    for set in caption_sets:
        image_id = parseId(set)
        image_ids.append(image_id)
        image_captions = '\n'
        for caption in set:
            image_captions += parseCaption(caption)
        createXML(image_id, image_captions)

    # update txt file with image ids
    print 'Updating files'
    file_ids = open('image_ids.txt','rw+')
    file_ids.truncate()
    for id in image_ids:
        line = id + '\n'
        file_ids.write(line)
        
    # move all xml files into xml folder
    os.system('mv -f *.xml xml/')
    print 'Finished generating captions'
generateCaptions()
